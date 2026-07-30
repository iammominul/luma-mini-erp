import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_AGE,
  isCorrectPassword,
  isValidSessionValue,
  issueSessionValue,
} from './auth';

const SECRET = 'test-secret-value';

describe('the session cookie', () => {
  it('accepts a cookie it issued', async () => {
    const value = await issueSessionValue(SECRET);
    expect(await isValidSessionValue(value, SECRET)).toBe(true);
  });

  it('rejects a cookie signed with another secret', async () => {
    const value = await issueSessionValue('a-different-secret');
    expect(await isValidSessionValue(value, SECRET)).toBe(false);
  });

  it('rejects a tampered signature or issue time', async () => {
    const value = await issueSessionValue(SECRET);
    const [issuedAt, mac] = value.split('.') as [string, string];
    const flipped = mac.slice(0, -1) + (mac.endsWith('0') ? '1' : '0');
    expect(await isValidSessionValue(`${issuedAt}.${flipped}`, SECRET)).toBe(
      false,
    );
    expect(
      await isValidSessionValue(`${Number(issuedAt) - 5}.${mac}`, SECRET),
    ).toBe(false);
  });

  it('rejects nothing, nonsense, and a cookie past its life', async () => {
    expect(await isValidSessionValue(undefined, SECRET)).toBe(false);
    expect(await isValidSessionValue('', SECRET)).toBe(false);
    expect(await isValidSessionValue('not-a-cookie', SECRET)).toBe(false);

    const old = String(Date.now() - (SESSION_MAX_AGE + 60) * 1000);
    const mac = createHmac('sha256', SECRET).update(old).digest('hex');
    expect(await isValidSessionValue(`${old}.${mac}`, SECRET)).toBe(false);
  });

  it('signs the same way node crypto does, so tooling can mint a cookie', async () => {
    const issuedAt = Date.now().toString();
    const mac = createHmac('sha256', SECRET).update(issuedAt).digest('hex');
    expect(await isValidSessionValue(`${issuedAt}.${mac}`, SECRET)).toBe(true);
  });
});

describe('the shared password', () => {
  it('accepts the right one and refuses the rest', async () => {
    expect(await isCorrectPassword('open sesame', 'open sesame')).toBe(true);
    expect(await isCorrectPassword('Open Sesame', 'open sesame')).toBe(false);
    expect(await isCorrectPassword('', 'open sesame')).toBe(false);
    expect(await isCorrectPassword('open sesame ', 'open sesame')).toBe(false);
  });
});
