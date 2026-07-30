import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  formatQtyKg,
  lineAmount,
  parseQtyKg,
  parseRate,
  sumGrams,
  sumMoney,
} from './amount';

describe('parseQtyKg', () => {
  it('reads whole and fractional kg as grams', () => {
    expect(parseQtyKg('125')).toBe(125000n);
    expect(parseQtyKg('125.5')).toBe(125500n);
    expect(parseQtyKg('125.125')).toBe(125125n);
    expect(parseQtyKg(' 0.001 ')).toBe(1n);
  });

  it('rejects anything finer than a gram or not a number', () => {
    expect(() => parseQtyKg('1.2345')).toThrow(RangeError);
    expect(() => parseQtyKg('-5')).toThrow(RangeError);
    expect(() => parseQtyKg('12kg')).toThrow(RangeError);
    expect(() => parseQtyKg('')).toThrow(RangeError);
  });
});

describe('parseRate', () => {
  it('reads a rate as poisha', () => {
    expect(parseRate('45')).toBe(4500n);
    expect(parseRate('45.5')).toBe(4550n);
    expect(parseRate('45.55')).toBe(4555n);
    expect(parseRate('0')).toBe(0n);
  });

  it('rejects a rate finer than a poisha', () => {
    expect(() => parseRate('45.555')).toThrow(RangeError);
  });
});

describe('lineAmount', () => {
  it('multiplies weight by rate exactly', () => {
    expect(lineAmount('1000', '45').toDecimalString()).toBe('45000.00');
    expect(lineAmount('1250.5', '45.5').toDecimalString()).toBe('56897.75');
  });

  it('does not drift the way floating point does', () => {
    // 0.1 * 3 in binary floating point is 0.30000000000000004.
    expect(lineAmount('0.1', '3').toDecimalString()).toBe('0.30');
    // 1675.35 kg at 32.15 is 53862.5025, which rounds to 53862.50.
    expect(lineAmount('1675.35', '32.15').toDecimalString()).toBe('53862.50');
  });

  it('rounds half up at the poisha', () => {
    // 0.005 kg at 1.00 = 0.005 taka, exactly half a poisha, rounds up.
    expect(lineAmount('0.005', '1').toDecimalString()).toBe('0.01');
    // 0.004 kg at 1.00 rounds down.
    expect(lineAmount('0.004', '1').toDecimalString()).toBe('0.00');
  });

  it('handles a zero rate (a free reprocess line)', () => {
    expect(lineAmount('500.25', '0').toDecimalString()).toBe('0.00');
  });

  it('stays exact on amounts near the NUMERIC(14,2) ceiling', () => {
    expect(lineAmount('999999.999', '999.99').toDecimalString()).toBe(
      '999989999.00',
    );
  });
});

describe('sumMoney', () => {
  it('adds a bill to its total', () => {
    const lines = [
      lineAmount('1250.5', '45.5'),
      lineAmount('880', '52.25'),
      lineAmount('12.125', '38'),
    ];
    expect(sumMoney(lines).toDecimalString()).toBe('103338.50');
  });

  it('is zero for no lines', () => {
    expect(sumMoney([])).toStrictEqual(Money.ZERO);
  });
});

describe('grams', () => {
  it('totals and formats weight', () => {
    const grams = [
      parseQtyKg('1250.5'),
      parseQtyKg('880'),
      parseQtyKg('12.125'),
    ];
    expect(formatQtyKg(sumGrams(grams))).toBe('2142.625');
  });

  it('formats zero and small weights with three decimals', () => {
    expect(formatQtyKg(0n)).toBe('0.000');
    expect(formatQtyKg(5n)).toBe('0.005');
    expect(formatQtyKg(-1500n)).toBe('-1.500');
  });
});
