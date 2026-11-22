import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Makes an ID from a prefix and 22 random URL-safe characters (16 random bytes), like bxapi's IDs.
 *
 * @param prefix - The prefix, such as `usr`.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

/** Makes a user token: `bxt_` and 43 URL-safe characters (32 random bytes). */
export function newToken(): string {
  return `bxt_${randomBytes(32).toString('base64url')}`;
}

/**
 * Hashes a token for storage, so a copy of the database doesn't hold usable tokens.
 *
 * @param token - The token.
 * @returns The SHA-256 digest in hexadecimal.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The alphabet of invite codes: Crockford's base 32, which has no I, L, O, or U. */
const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Makes an invite code of 20 base-32 characters (100 random bits), grouped by five with dashes.
 *
 * @returns A code such as `7K2QX-M9D4R-...`.
 */
export function newInviteCode(): string {
  let code = '';
  for (let i = 0; i < 20; i += 1) {
    if (i > 0 && i % 5 === 0) code += '-';
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalizes an invite code that a person typed: drops dashes and spaces, uppercases it, and maps the letters
 * people confuse with digits.
 *
 * @param code - The code as typed.
 * @returns The code in the stored form, grouped by five.
 */
export function normalizeInviteCode(code: string): string {
  const plain = code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return plain.replace(/(.{5})(?=.)/g, '$1-');
}

/**
 * Compares two secrets in constant time.
 *
 * @param a - One secret.
 * @param b - The other secret.
 */
export function secretsEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** The current time as a UTC timestamp with whole seconds, like `2026-11-20T22:01:05Z`. */
export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
