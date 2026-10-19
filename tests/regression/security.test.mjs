import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ts = require(path.join(ROOT, 'candle-garden-web/node_modules/typescript'));
const response = { json: (body, { status = 200 } = {}) => Response.json(body, { status }) };

function route(file, stubs, fetch) {
  const source = fs.readFileSync(path.join(ROOT, 'candle-garden-web/src', file), 'utf8');
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const context = { exports: {}, process: { env: { STRIPE_SECRET_KEY: 'sk_test_fictional' } },
    fetch, Response, URL, Date, Math, encodeURIComponent,
    require: id => { assert.ok(stubs[id], `Unstubbed ${id}`); return stubs[id]; } };
  vm.runInNewContext(code, context);
  return context.exports;
}

test('local orders API smoke: saved checkout is returned; injected prices and items are ignored', async () => {
  const order = { id: 'order-one', customer_id: 'user-one', payment_intent_id: 'pi_one', total_amount: 35, items: [{ name: 'Original candle' }] };
  const api = route('app/orders/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/mobile-auth': { mobileIdentity: async () => ({ sub: 'user-one' }) },
    '@/lib/mobileadmin/data': { findOrderByPaymentIntent: async () => order },
  });
  const result = await api.POST(new Request('https://local.test/orders', { method: 'POST', body: JSON.stringify({ payment_intent_id: 'pi_one', total: 0.01, items: [{ name: 'Injected' }] }) }));
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), order);
});

test('local orders API smoke rejects missing checkout, other owners and anonymous writes', async () => {
  for (const [identity, order] of [
    [{ sub: 'user-one' }, undefined],
    [{ sub: 'user-one' }, { customer_id: 'other-user' }],
    [null, undefined],
  ]) {
    const api = route('app/orders/route.ts', {
      'next/server': { NextResponse: response },
      '@/lib/mobile-auth': { mobileIdentity: async () => identity },
      '@/lib/mobileadmin/data': { findOrderByPaymentIntent: async () => order },
    });
    const result = await api.POST(new Request('https://local.test/orders', { method: 'POST', body: JSON.stringify({ payment_intent_id: 'pi_one' }) }));
    assert.equal(result.status, identity ? 400 : 401);
  }
});

test('local finalize API smoke preserves valid guest and signed-in test payments and rejects substitutions', async () => {
  for (const customer of ['guest:dev_testing12345', 'user-one']) {
    for (const mutation of [null, 'metadata', 'amount', 'received', 'owner', 'mode', 'id']) {
      let labels = 0, updates = 0;
      const order = { id: 'order-one', customer_id: customer, payment_intent_id: 'pi_one', total_amount: 35, items: [{ type: 'refill' }] };
      const intent = { id: 'pi_one', amount: 3500, amount_received: 3500, currency: 'usd', status: 'succeeded', livemode: false, metadata: { candle_garden_order_id: 'order-one' } };
      if (mutation === 'metadata') intent.metadata.candle_garden_order_id = 'other-order';
      if (mutation === 'amount') intent.amount = 1;
      if (mutation === 'received') intent.amount_received = 1;
      if (mutation === 'owner') order.customer_id = 'other-user';
      if (mutation === 'mode') intent.livemode = true;
      if (mutation === 'id') intent.id = 'pi_other';
      const api = route('app/payments/finalize/route.ts', {
        'next/server': { NextResponse: response },
        '@/lib/mobile-auth': { mobileCustomerId: async () => customer },
        '@/lib/mobileadmin/data': { findOrderByPaymentIntent: async () => order, updateMobileOrder: async () => { updates++; } },
        '@/lib/purchase-refill-labels': { purchaseOrderLegs: async () => { labels++; return { labels: [], printed: [] }; } },
        '@/lib/shipping-labels': { labelStatusFrom: () => 'none' },
        '@/lib/stripe-refunds': { succeededRefundCents: async () => 0 },
      }, async () => response.json(intent));
      const result = await api.POST(new Request('https://local.test/payments/finalize', { method: 'POST', body: JSON.stringify({ paymentIntentId: 'pi_one' }) }));
      assert.equal(result.status, mutation ? 400 : 200, `${customer}/${mutation}`);
      assert.equal(labels, mutation ? 0 : 1);
      assert.equal(updates, mutation ? 0 : 1);
      if (!mutation) assert.equal((await result.json()).status, 'paid_test');
    }
  }
});

test('finalize leaves a refunded order refunded and does not buy labels', async () => {
  let labels = 0;
  const order = { id: 'order-one', customer_id: 'user-one', payment_intent_id: 'pi_one', total_amount: 35, status: 'refunded', items: [{ type: 'refill' }], shipping_labels: [] };
  const intent = { id: 'pi_one', amount: 3500, amount_received: 3500, currency: 'usd', status: 'succeeded', livemode: false, metadata: { candle_garden_order_id: 'order-one' } };
  const api = route('app/payments/finalize/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/mobile-auth': { mobileCustomerId: async () => 'user-one' },
    '@/lib/mobileadmin/data': { findOrderByPaymentIntent: async () => order, updateMobileOrder: async () => { throw new Error('must not update'); } },
    '@/lib/purchase-refill-labels': { purchaseOrderLegs: async () => { labels++; return { labels: [], printed: [] }; } },
    '@/lib/shipping-labels': { labelStatusFrom: () => 'none' },
    '@/lib/stripe-refunds': { succeededRefundCents: async () => 3500 },
  }, async () => response.json(intent));
  const result = await api.POST(new Request('https://local.test/payments/finalize', { method: 'POST', body: JSON.stringify({ paymentIntentId: 'pi_one' }) }));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.status, 'refunded');
  assert.equal(body.paid, false);
  assert.equal(labels, 0);
});

test('production staff sessions use the office secret and reject the built-in pepper', () => {
  const source = fs.readFileSync(path.join(ROOT, 'candle-garden-web/src/lib/admin/auth.ts'), 'utf8');
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  function load(env) {
    const context = { exports: {}, process: { env }, Buffer, URL, Date, Math,
      require: id => {
        if (id === 'crypto') return require('crypto');
        if (id === 'next/headers') return { cookies: async () => ({ get() {} }) };
        throw new Error(`Unstubbed ${id}`);
      } };
    vm.runInNewContext(code, context);
    return context.exports;
  }
  const office = load({ NODE_ENV: 'production', VERCEL_ENV: 'production', OFFICE_SESSION_SECRET: 'office-secret-value' });
  const token = office.createSessionToken('GardenAdmin');
  assert.equal(office.validateSessionToken(token).ok, true);
  const exp = Date.now() + 60000;
  const body = `admin|GardenAdmin|${exp}`;
  const pepper = require('crypto').createHmac('sha256', 'candle-garden-admin-v1').update(body).digest('base64url');
  assert.equal(office.validateSessionToken(`${body}|${pepper}`).ok, false);
  const missing = load({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
  assert.throws(() => missing.createSessionToken('GardenAdmin'), /not configured/);
  assert.equal(missing.validateSessionToken(`${body}|${pepper}`).ok, false);
});

test('WebView allows real booking/payment domains and rejects deceptive URLs and HTTP', () => {
  const source = fs.readFileSync(path.join(ROOT, 'candle-garden-mobile/components/AcuityScheduler.native.js'), 'utf8');
  const start = source.indexOf('const ALLOWED');
  const end = source.indexOf('export default function');
  const context = { URL };
  vm.runInNewContext(source.slice(start, end), context);
  for (const url of ['https://thecandlegarden.co/classes', 'https://checkout.stripe.com/pay', 'https://www.paypal.com/pay', 'about:blank']) {
    assert.equal(context.isAllowed(url), true, url);
  }
  for (const url of ['https://stripe.com.attacker.invalid/', 'https://attacker.invalid/?next=thecandlegarden.co',
    'https://stripe.com@attacker.invalid/', 'http://thecandlegarden.co/classes', 'data:text/html,hello',
    'https://embed.acuityscheduling.com/', 'invalid']) {
    assert.equal(context.isAllowed(url), false, url);
  }
});

test('account deletion waits for cleanup and remains retryable after a purge failure', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'candle-garden-mobile/lib/AuthContext.js'), 'utf8');
  const tree = ts.createSourceFile('AuthContext.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'deleteAccount') callback = node.initializer.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callback);
  for (const fail of [false, true]) {
    const calls = [];
    const context = { tokens: { accessToken: 'test-token' }, setBusy() {}, setError() {}, setTokens() {}, setUser() {},
      purgeAccountData: async () => { calls.push('purge'); if (fail) throw new Error('Retry cleanup'); },
      cognitoDeleteUser: async () => { calls.push('delete'); }, clearTokens: async () => { calls.push('clear'); } };
    const remove = vm.runInNewContext(`(${callback})`, context);
    if (fail) await assert.rejects(remove(), /Retry cleanup/);
    else assert.equal(await remove(), true);
    assert.deepEqual(calls, fail ? ['purge'] : ['purge', 'delete', 'clear']);
  }
});

test('sign-in and refresh keep an expiry in memory so long testing sessions refresh automatically', async () => {
  const values = new Map();
  let now = 1000000, refreshes = 0;
  const storeSource = fs.readFileSync(path.join(ROOT, 'candle-garden-mobile/lib/authStorage.js'), 'utf8');
  const context = { exports: {}, Date: { now: () => now }, require: id => {
    assert.equal(id, './clientStorage');
    return { setItemAsync: async (key, value) => values.set(key, value),
      deleteItemAsync: async key => values.delete(key), getItemAsync: async key => values.get(key) };
  } };
  vm.runInNewContext(ts.transpile(storeSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  const source = fs.readFileSync(path.join(ROOT, 'candle-garden-mobile/lib/AuthContext.js'), 'utf8');
  const tree = ts.createSourceFile('AuthContext.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const callbacks = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['applySession', 'getAccessToken', 'getIdToken'].includes(node.name.getText(tree))) {
      callbacks[node.name.getText(tree)] = node.initializer.arguments[0].getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  const session = { ...context.exports, Date: context.Date, tokens: null,
    setTokens: value => { session.tokens = value; }, setUser() {},
    getUser: async () => ({}), attributesToObject: () => ({ email: 'tester@example.com' }),
    refreshSession: async refreshToken => { refreshes++; return { accessToken: 'access-new', idToken: 'id-new', refreshToken, expiresIn: 3600 }; } };
  const apply = vm.runInNewContext(`(${callbacks.applySession})`, session);
  const access = vm.runInNewContext(`(${callbacks.getAccessToken})`, session);
  const id = vm.runInNewContext(`(${callbacks.getIdToken})`, session);
  await apply({ accessToken: 'access-old', idToken: 'id-old', refreshToken: 'refresh', expiresIn: 3600 });
  assert.equal(session.tokens.expiresAt, now + 3540000);
  assert.equal(await access(), 'access-old');
  now += 3550000;
  assert.equal(await access(), 'access-new');
  assert.equal(await id(), 'id-new');
  assert.equal(session.tokens.expiresAt, now + 3540000);
  assert.equal(refreshes, 1);
  now += 3550000;
  assert.equal(await id(), 'id-new');
  assert.equal(refreshes, 2);
});
