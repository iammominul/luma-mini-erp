import { describe, expect, it } from 'vitest';
import { Money } from './money';

describe('Money', () => {
  it('parses a decimal string exactly', () => {
    expect(Money.fromDecimal('1234.56').toDecimalString()).toBe('1234.56');
    expect(Money.fromDecimal('100').toDecimalString()).toBe('100.00');
    expect(Money.fromDecimal('0.5').toDecimalString()).toBe('0.50');
  });

  it('does not drift the way floating point does (0.1 + 0.2)', () => {
    const sum = Money.fromDecimal('0.10').add(Money.fromDecimal('0.20'));
    expect(sum.toDecimalString()).toBe('0.30');
  });

  it('handles negatives', () => {
    expect(Money.fromDecimal('-50.25').toDecimalString()).toBe('-50.25');
    expect(
      Money.fromDecimal('5').subtract(Money.fromDecimal('8')).toDecimalString(),
    ).toBe('-3.00');
  });

  it('rejects amounts finer than poisha', () => {
    expect(() => Money.fromDecimal('1.234')).toThrow(RangeError);
    expect(() => Money.fromDecimal('abc')).toThrow(RangeError);
  });

  it('compares and tests for zero', () => {
    expect(Money.ZERO.isZero()).toBe(true);
    expect(Money.fromDecimal('1.00').isNegative()).toBe(false);
    expect(Money.fromDecimal('1.00').compare(Money.fromDecimal('2.00'))).toBe(
      -1,
    );
    expect(Money.fromDecimal('2.00').equals(Money.fromDecimal('2.00'))).toBe(
      true,
    );
  });
});
