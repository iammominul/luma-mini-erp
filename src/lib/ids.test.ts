import { describe, expect, it } from 'vitest';
import { isDocNo, isPartyCode, isUuid } from './ids';

/**
 * These guards stand between a URL and a `::uuid` cast in Postgres, which throws
 * on anything the wrong shape. A gap here is a server error on a mistyped link.
 */
describe('isUuid', () => {
  it('accepts a real id in either case', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(isUuid('68e9b286-8402-432e-8f59-9545f73749a0')).toBe(true);
    expect(isUuid('68E9B286-8402-432E-8F59-9545F73749A0')).toBe(true);
  });

  it('rejects everything a URL might otherwise carry', () => {
    for (const value of [
      '',
      'nonsense',
      'CUS-0001',
      'CB-26-0113',
      '68e9b286-8402-432e-8f59',
      '68e9b286-8402-432e-8f59-9545f73749a0x',
      '68e9b286_8402_432e_8f59_9545f73749a0',
      'g8e9b286-8402-432e-8f59-9545f73749a0',
      "'; drop table bill; --",
    ]) {
      expect(isUuid(value), value).toBe(false);
    }
  });
});

describe('isPartyCode', () => {
  it('accepts the codes issued today and the ones a supplier will take', () => {
    expect(isPartyCode('CUS-0001')).toBe(true);
    expect(isPartyCode('SUB-0001')).toBe(true);
    expect(isPartyCode('SUP-0001')).toBe(true);
    expect(isPartyCode('cus-0001')).toBe(true);
  });

  it('accepts a code that has outgrown four digits', () => {
    // The counter widens rather than truncating, so the pattern must not cap it.
    expect(isPartyCode('CUS-10000')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['', 'CUS', '0001', 'CUS-', 'C-0001', 'CUSTOM-0001']) {
      expect(isPartyCode(value), value).toBe(false);
    }
  });
});

describe('isDocNo', () => {
  it('accepts a system bill number', () => {
    expect(isDocNo('CB-26-0113')).toBe(true);
    expect(isDocNo('cb-26-0113')).toBe(true);
  });

  it('accepts one that has outgrown four digits', () => {
    expect(isDocNo('CB-26-10000')).toBe(true);
  });

  it('does not confuse a party code with a bill number', () => {
    expect(isDocNo('CUS-0001')).toBe(false);
    expect(isPartyCode('CB-26-0113')).toBe(false);
  });
});
