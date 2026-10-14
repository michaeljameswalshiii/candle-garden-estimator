import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';
const require = createRequire(path.join(ROOT, 'candle-garden-web/package.json'));
const ts = require('typescript');
const source = fs.readFileSync(path.join(ROOT, 'packages/catalog/refillScents.ts'), 'utf8').replace('import approvedScents from "./refill-scents.json";', 'const approvedScents = ' + fs.readFileSync(path.join(ROOT, 'packages/catalog/refill-scents.json'), 'utf8') + ';');
const js = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const helpers = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const products = [
  { id: 'refill:atlantic-beach', name: 'Atlantic Beach', type: 'physical', description: 'Candle Scent Notes: sea salt, jasmine' },
  { id: 'refill:almond', name: 'Almond', type: 'physical', description: 'Candle Scent Notes: almond, vanilla' },
  { id: 'gone', name: 'Unavailable', type: 'physical', soldOut: true, description: 'Candle Scent Notes: citrus' },
  { id: 'gift', name: 'Gift card', type: 'gift_card', description: 'Candle Scent Notes: gift' },
  { id: 'subscription', name: 'Subscription', type: 'subscription', description: 'Candle Scent Notes: assorted' },
];
const scents = helpers.refillScents(products);
test('refill picker lists available candle scents with notes, sorted by name', () => {
  assert.equal(scents.length, 11); assert.ok(scents.some(scent => scent.name === 'Blood orange')); assert.deepEqual(scents.map(scent => scent.name), [...scents.map(scent => scent.name)].sort((a,b)=>a.localeCompare(b)));
  assert.match(scents[0].notes, /almond/i);
});
test('photo and manual estimates each produce a vessel list', () => {
  assert.deepEqual(helpers.estimateVessels({ estimated_ounces: 12 }), [{ description: 'Vessel 1', ounces: 12 }]);
  assert.deepEqual(helpers.estimateVessels({ estimated_ounces: 20, vessels: [{ description: 'Blue mug', wax_needed_oz: 8 }, { volume_oz: 12 }] }), [{ description: 'Blue mug', ounces: 8 }, { description: 'Vessel 2', ounces: 12 }]);
});
test('every vessel needs a scent and distinct assignments remain distinct in the cart', () => {
  const vessels = helpers.estimateVessels({ estimated_ounces: 20, vessels: [{ wax_needed_oz: 8 }, { wax_needed_oz: 12 }] });
  assert.throws(() => helpers.vesselScentChoices(vessels, ['refill:almond'], scents), /vessel 2/);
  const mixed = helpers.vesselScentChoices(vessels, ['refill:almond', 'refill:atlantic-beach'], scents);
  const same = helpers.vesselScentChoices(vessels, ['refill:almond', 'refill:almond'], scents);
  assert.notEqual(helpers.refillScentKey(mixed), helpers.refillScentKey(same));
  assert.equal(helpers.scentSummary(mixed), 'Vessel 1: Almond (8 oz) · Vessel 2: Atlantic Beach (12 oz)');
  assert.deepEqual(helpers.validateVesselScents(mixed, 2, products), mixed);
});
test('server canonicalizes names and rejects unavailable, missing, extra, or invalid vessel choices', () => {
  const choice = { scentId: 'refill:almond', scentName: 'Forged', ounces: 12 };
  assert.equal(helpers.validateVesselScents([choice], 1, products)[0].scentName, 'Almond');
  assert.throws(() => helpers.validateVesselScents([{ ...choice, scentId: 'gone' }], 1, products), /unavailable/);
  assert.throws(() => helpers.validateVesselScents([], 1, products), /every vessel/);
  assert.throws(() => helpers.validateVesselScents([choice, choice], 1, products), /every vessel/);
  assert.throws(() => helpers.validateVesselScents([{ ...choice, ounces: -2 }], 1, products), /volumes/);
  assert.equal(helpers.validateVesselScents(undefined, 1, products), undefined);
});

test('payment checkout persists per-vessel scents with the server-authenticated customer', async () => {
  const stored = [];
  const json = (value, options) => Response.json(value, options);
  const stubs = {
    'crypto': { randomUUID: () => 'order-test' },
    'next/server': { NextResponse: { json } },
    '@/app/api/mobile/catalog/route': { GET: async () => json({ products }) },
    '@/app/api/mobile/classes/route': { GET: async () => json({ classes: [] }) },
    '@/lib/mobile-promotions': { applyPromotion: async (_key, _code, total) => ({ amount: total, discount: 0 }), releasePromotion: async () => {} },
    '@/lib/shippo': { candleGardenOrigin: () => ({}) },
    '@/lib/mobile-auth': { mobileCustomerId: async () => 'session-customer', mobileIdentity: async () => ({ email: 'verified@example.com' }) },
    '@/lib/mobileadmin/data': { putMobileOrder: async order => stored.push(order) },
    '@/lib/refill-pricing': { checkoutParty: () => ({}), priceRefillShipping: async () => ({ shippingCents: 0, serviceSummary: 'Pickup' }) },
    '@/lib/shipping-labels': { stubLabelsForItems: () => [] },
    '../../../../../packages/catalog/refillScents': helpers,
  };
  const route = ts.transpile(fs.readFileSync(path.join(ROOT, 'candle-garden-web/src/app/payments/payment-sheet/route.ts'), 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const context = { exports: {}, require: id => { if (!stubs[id]) throw Error(`Unexpected dependency: ${id}`); return stubs[id]; }, process: { env: { STRIPE_SECRET_KEY: 'sk_test_stub' } }, URLSearchParams, fetch: async () => json({ id: 'pi_test', client_secret: 'test' }) };
  vm.runInNewContext(route, context);
  const vesselScents = helpers.vesselScentChoices(helpers.estimateVessels({ estimated_ounces: 20, vessels: [{ wax_needed_oz: 8 }, { wax_needed_oz: 12 }] }), ['refill:almond', 'refill:atlantic-beach'], scents);
  const request = choices => ({ json: async () => ({ owner: 'untrusted-client', fulfillment: 'pickup', items: [{ type: 'refill', quantity: 1, ounces: 20, vesselCount: 2, vesselScents: choices }] }) });
  const response = await context.exports.POST(request(vesselScents));
  assert.equal(response.status, 200);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].customer_id, 'session-customer');
  assert.deepEqual(JSON.parse(JSON.stringify(stored[0].items[0].vesselScents)), vesselScents);
  const rejected = await context.exports.POST(request([]));
  assert.equal(rejected.status, 400);
  assert.equal(stored.length, 1);
});
