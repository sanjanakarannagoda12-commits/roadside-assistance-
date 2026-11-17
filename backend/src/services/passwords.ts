// Admin passwords: scrypt (built into Node), random salt per password, constant-time compare.
// Stored as "scrypt$N$r$p$salt$hash" so the cost can be raised later without breaking old hashes.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 2 ** 15;
const r = 8;
const p = 1;
const KEYLEN = 64;

const derive = (password: string, salt: Buffer, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { ...opts, maxmem: 128 * N * opts.r! * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, rr, pp, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(rr), p: Number(pp) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Used when the email doesn't exist, so a wrong email takes as long as a wrong password. */
export const DUMMY_HASH_PROMISE = hashPassword(randomBytes(16).toString('hex'));
