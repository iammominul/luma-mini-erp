import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { formatTaka, formatTakaPrefixed, groupLakhCrore } from './format';

describe('groupLakhCrore', () => {
  it('leaves three or fewer digits untouched', () => {
    expect(groupLakhCrore('0')).toBe('0');
    expect(groupLakhCrore('999')).toBe('999');
  });

  it('groups the last three digits, then in pairs', () => {
    expect(groupLakhCrore('1234')).toBe('1,234');
    expect(groupLakhCrore('12345')).toBe('12,345');
    expect(groupLakhCrore('123456')).toBe('1,23,456');
    expect(groupLakhCrore('1234567')).toBe('12,34,567');
    expect(groupLakhCrore('12345678')).toBe('1,23,45,678');
  });
});

describe('formatTaka', () => {
  it('always shows two decimals with grouping', () => {
    expect(formatTaka(Money.fromDecimal('1234567.5'))).toBe('12,34,567.50');
    expect(formatTaka(Money.fromDecimal('100'))).toBe('100.00');
    expect(formatTaka(Money.ZERO)).toBe('0.00');
  });

  it('keeps a leading minus on negatives', () => {
    expect(formatTaka(Money.fromDecimal('-1234.56'))).toBe('-1,234.56');
  });
});

describe('formatTakaPrefixed', () => {
  it('prefixes with Tk by default', () => {
    expect(formatTakaPrefixed(Money.fromDecimal('1234.56'))).toBe(
      'Tk 1,234.56',
    );
  });

  it('accepts a custom prefix', () => {
    expect(formatTakaPrefixed(Money.fromDecimal('50'), 'BDT')).toBe(
      'BDT 50.00',
    );
  });
});
