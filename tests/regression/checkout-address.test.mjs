import assert from 'node:assert/strict';
import test from 'node:test';
import { profileShipping, previousShipping, fillEmptyShipping, applyProfileContact, displayPhone } from '../../candle-garden-mobile/lib/checkoutAddress.js';

test('account addresses parse freeform and Cognito structured mailing addresses', () => {
  const user={name:'Buyer',email:'buyer@example.com',address:'363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL 32233'};
  assert.deepEqual(profileShipping(user),{name:'Buyer',email:'buyer@example.com',phone:'',address:'363 Atlantic Boulevard, Suite 8',city:'Atlantic Beach',state:'FL',zip:'32233'});
  assert.equal(profileShipping({address:JSON.stringify({street_address:'1 Main St',locality:'Boston',region:'MA',postal_code:'02108'})}).zip,'02108');
  assert.equal(profileShipping({address:'incomplete street'}).address,'');
});

test('prefill preserves customer edits and selects newest completed order with shipping', () => {
  const previous=previousShipping([{status:'paid',created_at:'2026-10-12',shipping:{address:'Old St',zip:'32233'}},
    {status:'paid',created_at:'2026-10-14',shipping:{address:'New St',zip:'02108'}},
    {status:'payment_pending',created_at:'2026-10-15',shipping:{address:'Unpaid St',zip:'10001'}}]);
  assert.equal(previous.address,'New St');
  assert.deepEqual(fillEmptyShipping({address:'My edit',city:''},previous,{city:'Boston'}),{address:'My edit',city:''});
  assert.equal(previousShipping([]),undefined);
});

test('signed-in checkout keeps the profile email and phone', () => {
  const user = { name: 'Buyer', email: 'buyer@example.com', phone: '+19043167608' };
  const saved = { name: 'Buyer', email: 'old@example.com', phone: '5551112222', address: '14 Priscilla Rd', city: 'Lynnfield', state: 'MA', zip: '01940' };
  const next = applyProfileContact(fillEmptyShipping(saved, profileShipping(user)), user);
  assert.equal(next.email, 'buyer@example.com');
  assert.equal(next.phone, '+19043167608');
  assert.equal(next.address, '14 Priscilla Rd');
  assert.equal(applyProfileContact({ phone: '5551112222', email: 'typed@example.com' }, { email: 'buyer@example.com' }).phone, '5551112222');
  assert.equal(displayPhone('+19043167608'), '(904) 316-7608');
  assert.equal(displayPhone(''), '');
});
