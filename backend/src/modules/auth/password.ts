import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Versioned, fixed parameters keep verification bounded even with a corrupt row.
const prefix = 'scrypt$131072$8$1';
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${prefix}$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
// A fixed dummy record makes nonexistent-account login do the same KDF work.
export const dummyHash = `${prefix}$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) {
    throw new Error('Unsupported password record');
  }
  const parts = stored.split('$');
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'));
}
