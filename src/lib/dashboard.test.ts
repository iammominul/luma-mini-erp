import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  datum,
  foldToTop,
  lastDayOf,
  monthsBetween,
  rangeFor,
  shortMonth,
} from './dashboard';

const tk = (value: string) => Money.fromDecimal(value);

describe('a chart datum', () => {
  it('carries the formatted figure alongside the geometry', () => {
    const point = datum('Aug 26', tk('643798.00'));
    // Grouped in lakh, the way every other figure in the app reads.
    expect(point.display).toBe('6,43,798.00');
    expect(point.value).toBe(643798);
  });

  it('formats the poisha exactly, whatever the geometry rounds to', () => {
    // The figure a reader sees comes off Money, so it is exact. The number
    // beside it is only ever a bar length.
    expect(datum('x', tk('125.23')).display).toBe('125.23');
  });
});

describe('folding to the top few', () => {
  const rows = [
    { label: 'Rent', amount: tk('40000') },
    { label: 'Utilities', amount: tk('18000') },
    { label: 'Transport', amount: tk('12000') },
    { label: 'Office', amount: tk('9000') },
    { label: 'Repairs', amount: tk('4000') },
    { label: 'Bank Charges', amount: tk('1500.50') },
  ];

  it('keeps four and adds the rest up as Other', () => {
    const folded = foldToTop(rows);
    expect(folded.map((f) => f.label)).toEqual([
      'Rent',
      'Utilities',
      'Transport',
      'Office',
      'Other (2)',
    ]);
    expect(folded[4]?.display).toBe('5,500.50');
  });

  it('adds Other as money, so the chart still totals the same', () => {
    const folded = foldToTop(rows);
    const total = folded.reduce(
      (sum, f) => sum.add(Money.fromDecimal(f.display.replace(/,/g, ''))),
      Money.ZERO,
    );
    expect(total.toDecimalString()).toBe('84500.50');
  });

  it('adds no Other when there is nothing to fold', () => {
    expect(foldToTop(rows.slice(0, 3)).map((f) => f.label)).toEqual([
      'Rent',
      'Utilities',
      'Transport',
    ]);
  });

  it('leaves out a category with nothing spent on it', () => {
    expect(
      foldToTop([
        { label: 'Rent', amount: tk('100') },
        { label: 'Repairs', amount: Money.ZERO },
      ]).map((f) => f.label),
    ).toEqual(['Rent']);
  });

  it('orders by amount, largest first', () => {
    expect(
      foldToTop([
        { label: 'Small', amount: tk('10') },
        { label: 'Big', amount: tk('900') },
      ])[0]?.label,
    ).toBe('Big');
  });
});

describe('the dashboard ranges', () => {
  it('runs the last twelve months up to and including this one', () => {
    expect(rangeFor('last12', '2026-08-12')).toEqual({
      from: '2025-09-01',
      to: '2026-08-31',
      months: 12,
    });
  });

  it('crosses the year end correctly', () => {
    expect(rangeFor('last12', '2026-02-05').from).toBe('2025-03-01');
  });

  it('takes this year as the calendar year', () => {
    expect(rangeFor('thisYear', '2026-08-12')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      months: 12,
    });
  });

  it('takes last year as the one before', () => {
    expect(rangeFor('lastYear', '2026-08-12').from).toBe('2025-01-01');
  });

  it('ends February on the right day, leap year included', () => {
    expect(lastDayOf(2026, 2)).toBe('2026-02-28');
    expect(lastDayOf(2028, 2)).toBe('2028-02-29');
  });
});

describe('months across a range', () => {
  it('lists every month, so an empty one is still a column', () => {
    expect(monthsBetween('2026-06-01', '2026-09-30')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses a year end', () => {
    expect(monthsBetween('2025-11-01', '2026-02-28')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('gives twelve months for a last12 range', () => {
    const range = rangeFor('last12', '2026-08-12');
    expect(monthsBetween(range.from, range.to)).toHaveLength(12);
  });

  it('labels a month the way it reads under a bar', () => {
    expect(shortMonth('2026-08')).toBe('Aug 26');
  });
});
