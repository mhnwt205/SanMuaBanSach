import nodeCrypto from 'node:crypto';

// One of OWASP's published scrypt profiles: N=2^15, r=8, p=3 (32 MiB).
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], pair => parseInt(pair, 16));

function deriveScrypt(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    nodeCrypto.scrypt(password, salt, 32, SCRYPT, (error, key) => {
      if (error) reject(error);
      else resolve(Uint8Array.from(key));
    });
  });
}

export async function passwordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveScrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${toHex(salt)}$${toHex(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts[0] === 'scrypt') {
    const [scheme, n, r, p, salt, expected] = parts;
    if (parts.length !== 6 || scheme !== 'scrypt' || n !== String(SCRYPT.N) || r !== String(SCRYPT.r) || p !== String(SCRYPT.p) || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
    return nodeCrypto.timingSafeEqual(await deriveScrypt(password, fromHex(salt)), fromHex(expected));
  }
  // Existing local PBKDF2 hashes remain readable; do not rewrite or discard them.
  if (parts[0] === 'pbkdf2') {
    const [, iterations, salt, expected] = parts;
    if (parts.length !== 4 || iterations !== '160000' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 160000, hash: 'SHA-256' }, key, 256);
    return nodeCrypto.timingSafeEqual(new Uint8Array(bits), fromHex(expected));
  }
  return false;
}

export function derivationLimitCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (/iteration counts above 100000/i.test(error.message)) return 'PASSWORD_KDF_ITERATION_LIMIT';
  if (/Scrypt failed: cost exceeds maximum/i.test(error.message)) return 'PASSWORD_KDF_COST_LIMIT';
  return null;
}
