/**
 * One shared password opens the app, as agreed for this interim tool. There are
 * no named users, so nothing here attributes a change to a person; the
 * activity log records what changed and when.
 *
 * The cookie carries an issue time and an HMAC over it, so a cookie cannot be
 * forged without SESSION_SECRET and it stops working after SESSION_DAYS.
 * Web Crypto is used rather than node:crypto because the same check runs in
 * middleware, which is not a Node runtime.
 */

export const SESSION_COOKIE = 'luma_interim_session';
const SESSION_DAYS = 14;

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Length-independent compare, so a wrong value leaks no timing information. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function issueSessionValue(secret: string): Promise<string> {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${await sign(issuedAt, secret)}`;
}

export async function isValidSessionValue(
  value: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!value) return false;
  const [issuedAt, mac] = value.split('.');
  if (!issuedAt || !mac || !/^\d+$/.test(issuedAt)) return false;
  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE) return false;
  return equal(mac, await sign(issuedAt, secret));
}

export async function isCorrectPassword(
  attempt: string,
  expected: string,
): Promise<boolean> {
  // Compare digests so the check does not depend on the password's length.
  const [a, b] = await Promise.all([
    sign(attempt, 'password-check'),
    sign(expected, 'password-check'),
  ]);
  return equal(a, b);
}
