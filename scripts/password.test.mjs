import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordHash, verifyPassword } from '../apps/api/src/password.ts';

test('scrypt hashes use independent salts, verify correctly and reject incorrect passwords', async () => {
  const first = await passwordHash('fixture-password-not-for-use');
  const second = await passwordHash('fixture-password-not-for-use');
  assert.match(first, /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('fixture-password-not-for-use', first), true);
  assert.equal(await verifyPassword('wrong-fixture-password', first), false);
  assert.equal(await verifyPassword('fixture-password-not-for-use', first.replace('$32768$', '$1$')), false);
  assert.equal(await verifyPassword('fixture-password-not-for-use', 'invalid-format'), false);
});

test('existing 160000-iteration PBKDF2 hashes remain verifiable locally', async () => {
  const password = 'legacy-fixture-password';
  const salt = new Uint8Array(16).fill(7);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 160000, hash: 'SHA-256' }, key, 256);
  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const stored = `pbkdf2$160000$${hex(salt)}$${hex(new Uint8Array(bits))}`;
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('incorrect-legacy-password', stored), false);
});
