import assert from 'node:assert/strict';
import test from 'node:test';
import nodeCrypto from 'node:crypto';
import app from '../apps/api/src/index.ts';

test('managed KDF limit reports unavailable registration rather than duplicate email', async (context) => {
  context.mock.method(nodeCrypto, 'scrypt', () => {
    throw new RangeError('Scrypt failed: cost exceeds maximum (fixture).');
  });
  const response = await app.fetch(new Request('https://example.test/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Runtime fixture', email: 'runtime@example.test', password: 'fixture-only-password' }),
  }), { DB: { prepare(sql) {
    if(sql.startsWith('INSERT INTO request_limits')) return {bind:()=>({first:async()=>({attempts:1})})};
    throw new Error('Account data must not be touched when password derivation fails');
  } } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'PASSWORD_KDF_COST_LIMIT');
});
