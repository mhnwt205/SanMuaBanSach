import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../apps/api/src/index.ts';

function environment(role) {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ id: 'seller-fixture', name: 'Fixture', email: 'fixture@example.test', role }), all: async () => ({results:[]}) }),
      }),
    },
  };
}

test('missing R2 returns an actionable 503 for image reads', async () => {
  const response = await app.fetch(new Request('https://example.test/api/images/seller-fixture/cover.png'), {});
  assert.equal(response.status, 503);
  assert.equal(typeof (await response.json()).error, 'string');
});

test('missing R2 does not bypass authentication or seller approval', async () => {
  const guest = await app.fetch(new Request('https://example.test/api/images', { method: 'POST' }), {});
  assert.equal(guest.status, 401);
  const buyer = await app.fetch(new Request('https://example.test/api/images', { method: 'POST', headers: { Cookie: 'cho_session=fixture' } }), environment('user'));
  assert.equal(buyer.status, 403);
});

test('approved seller receives 503 for upload when R2 is unbound', async () => {
  const response = await app.fetch(new Request('https://example.test/api/images', { method: 'POST', headers: { Cookie: 'cho_session=fixture' } }), environment('seller'));
  assert.equal(response.status, 503);
});

test('missing R2 preserves ownership checks for image deletion', async () => {
  const denied = await app.fetch(new Request('https://example.test/api/images/other-user/cover.png', { method: 'DELETE', headers: { Cookie: 'cho_session=fixture' } }), environment('seller'));
  assert.equal(denied.status, 403);
  const owner = await app.fetch(new Request('https://example.test/api/images/seller-fixture/cover.png', { method: 'DELETE', headers: { Cookie: 'cho_session=fixture' } }), environment('seller'));
  assert.equal(owner.status, 503);
});
