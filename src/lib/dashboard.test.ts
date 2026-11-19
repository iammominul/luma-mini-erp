import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  allDatesRange,
  datum,
  foldToShares,
  foldToTop,
  isDashboardRange,
  lastDayOf,
  monthBounds,
  monthsBetween,
  previousRange,
  rangeFor,
  sharesInOrder,
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

describe('the period before this one', () => {
  it('is the same length, ending the day before this one starts', () => {
    const range = rangeFor('last12', '2026-08-12');
    const before = previousRange(range.from, range.to);
    expect(before.to).toBe('2025-08-31');
    expect(before.from).toBe('2024-09-01');
  });

  // Nothing may fall between the two periods or into both of them, or a figure
  // compared against the one before it counts a day twice or not at all.
  it('touches this period without overlapping it', () => {
    const before = previousRange('2026-01-01', '2026-12-31');
    expect(before).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  // 15 Jan to 14 Feb is 31 days, so the 31 days before it start on 15 Dec.
  it('crosses a year end', () => {
    expect(previousRange('2026-01-15', '2026-02-14')).toEqual({
      from: '2025-12-15',
      to: '2026-01-14',
    });
  });

  // March has 31 days and February 2028 has 29, so the period before March
  // reaches two days back into January. Counting months instead would land on
  // the wrong day here every leap year.
  it('counts the days of a leap February rather than assuming 28', () => {
    expect(previousRange('2028-03-01', '2028-03-31')).toEqual({
      from: '2028-01-30',
      to: '2028-02-29',
    });
  });

  it('takes one day back from one day', () => {
    expect(previousRange('2026-08-23', '2026-08-23')).toEqual({
      from: '2026-08-22',
      to: '2026-08-22',
    });
  });
});

describe('all dates', () => {
  const book = { first: '2026-04-06', last: '2026-08-19' };

  it('runs from the first entry in the book to today', () => {
    expect(allDatesRange(book, '2026-08-23')).toEqual({
      from: '2026-04-06',
      to: '2026-08-23',
    });
  });

  // The one range named for holding everything must not be the one that drops
  // a bill somebody dated ahead.
  it('reaches past today for an entry dated ahead', () => {
    expect(
      allDatesRange({ ...book, last: '2026-09-30' }, '2026-08-23').to,
    ).toBe('2026-09-30');
  });

  it('is today to today on a book with nothing in it', () => {
    expect(allDatesRange(null, '2026-08-23')).toEqual({
      from: '2026-08-23',
      to: '2026-08-23',
    });
  });

  it('is a range the dashboard filter offers', () => {
    expect(isDashboardRange('allDates')).toBe(true);
    expect(rangeFor('allDates', '2026-08-23', book)).toEqual({
      from: '2026-04-06',
      to: '2026-08-23',
      months: 5,
    });
  });

  // A preset that cannot be worked out from the calendar has to be handed the
  // span. Without it the screen shows today alone rather than every month.
  it('falls back to today when the span was not read', () => {
    expect(rangeFor('allDates', '2026-08-23').from).toBe('2026-08-23');
  });

  it('draws a column for every month the book covers', () => {
    const range = rangeFor('allDates', '2026-08-23', book);
    expect(monthsBetween(range.from, range.to)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
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

describe('shares of a whole, for the donut', () => {
  it('gives each part its share of the total, worked out as money', () => {
    const shares = foldToShares([
      { label: 'Dyeing', amount: tk('600000.00') },
      { label: 'Freight', amount: tk('250000.00') },
      { label: 'Rent', amount: tk('150000.00') },
    ]);
    expect(shares?.totalDisplay).toBe('10,00,000.00');
    expect(shares?.slices.map((s) => [s.label, s.display, s.share])).toEqual([
      ['Dyeing', '6,00,000.00', '60.0%'],
      ['Freight', '2,50,000.00', '25.0%'],
      ['Rent', '1,50,000.00', '15.0%'],
    ]);
  });

  it('folds past the fourth into Other, and the total still adds up', () => {
    const shares = foldToShares(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => ({
        label,
        amount: tk(`${(6 - i) * 100}.00`),
      })),
    );
    expect(shares?.slices.map((s) => s.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'Other (2)',
    ]);
    // 600 + 500 + 400 + 300 + (200 + 100) = 2100
    expect(shares?.total.toDecimalString()).toBe('2100.00');
    expect(shares?.slices[4]?.display).toBe('300.00');
    expect(shares?.slices[4]?.share).toBe('14.3%');
  });

  it('rounds a share at the tenth, half up, with no float in the path', () => {
    const shares = foldToShares([
      { label: 'One', amount: tk('1.00') },
      { label: 'Two', amount: tk('2.00') },
    ]);
    expect(shares?.slices.map((s) => s.share)).toEqual(['66.7%', '33.3%']);
  });

  it('refuses a negative part, which no slice can show', () => {
    expect(
      foldToShares([
        { label: 'Cost', amount: tk('500.00') },
        { label: 'Refund', amount: tk('-50.00') },
      ]),
    ).toBeNull();
  });

  it('has nothing to draw when everything is zero', () => {
    expect(foldToShares([])).toBeNull();
    expect(foldToShares([{ label: 'Nil', amount: Money.ZERO }])).toBeNull();
  });
});

describe('one month inside the range', () => {
  it('is the whole month when the range covers it', () => {
    expect(monthBounds('2026-02', '2026-01-01', '2026-12-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('is cut to a custom range that starts or ends inside it', () => {
    expect(monthBounds('2026-03', '2026-03-10', '2026-03-20')).toEqual({
      from: '2026-03-10',
      to: '2026-03-20',
    });
  });
});

describe('shares in a fixed order, for the ageing strip', () => {
  it('keeps the order given rather than ranking by size', () => {
    const shares = sharesInOrder([
      { label: '0 to 30 Days', amount: tk('100.00') },
      { label: '31 to 60 Days', amount: tk('300.00') },
      { label: 'Over 90 Days', amount: tk('600.00') },
    ]);
    expect(shares?.slices.map((s) => [s.label, s.share])).toEqual([
      ['0 to 30 Days', '10.0%'],
      ['31 to 60 Days', '30.0%'],
      ['Over 90 Days', '60.0%'],
    ]);
    expect(shares?.totalDisplay).toBe('1,000.00');
  });

  it('keeps an empty bucket, so the strip always shows every age', () => {
    const shares = sharesInOrder([
      { label: 'Current', amount: tk('50.00') },
      { label: 'Old', amount: Money.ZERO },
    ]);
    expect(shares?.slices.map((s) => s.share)).toEqual(['100.0%', '0.0%']);
  });

  it('has nothing to show for a negative part or an empty whole', () => {
    expect(sharesInOrder([{ label: 'A', amount: tk('-1.00') }])).toBeNull();
    expect(sharesInOrder([])).toBeNull();
  });
});
