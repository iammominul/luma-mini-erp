import { Money } from './money';
import { formatTaka } from './format';

/**
 * What the dashboard charts are drawn from. Pure: no database, no framework.
 *
 * ## Money in a chart
 *
 * A bar height is a number, and money is never a JS number. Both stay true, and
 * this is the only place the two meet, so the rule is written here.
 *
 * Every datum carries the figure twice. `display` is the money, formatted, and
 * it is what appears in every visible place: the axis, the tooltip, the label
 * on the bar, the table underneath. `value` is a plain number and exists for
 * one purpose, which is to tell the renderer how long to draw the bar.
 *
 * Nothing adds, subtracts or compares `value`. Every total, difference and
 * share on the dashboard is worked out as Money here or in queries.ts and
 * reaches the chart already formatted. A poisha lost in a bar's geometry is a
 * pixel; a poisha lost in a figure is a wrong number on a screen somebody bills
 * from, and keeping the two apart is what stops the second happening.
 */

export type ChartDatum = {
  /** The category or month this bar stands for. */
  label: string;
  /** Bar geometry only. Never read as a figure, never used in arithmetic. */
  value: number;
  /** The figure, formatted. This is what a reader sees, everywhere. */
  display: string;
};

/** A datum from a Money, with the number kept for geometry alone. */
export function datum(label: string, amount: Money): ChartDatum {
  return {
    label,
    value: Number(amount.toDecimalString()),
    display: formatTaka(amount),
  };
}

/** One series of a grouped chart: a name, a color token, and its figures. */
export type ChartSeries = {
  key: string;
  label: string;
  /** A --color-chart-* token name, assigned in fixed order, never cycled. */
  color: string;
};

export const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
] as const;

export const CHART_OTHER_COLOR = 'var(--color-chart-other)';

/**
 * Keeps the largest few and adds the rest up as Other.
 *
 * Four is the cap because four is how many hues the palette validated for. A
 * fifth would need a hue that fails the separation checks, and a chart nobody
 * can read the colors of is worse than one that says Other.
 *
 * Other is a real total, added as Money, so the chart still adds up to the
 * figure on the stat tile above it.
 */
export function foldToTop(
  rows: { label: string; amount: Money }[],
  keep = 4,
): ChartDatum[] {
  const ranked = [...rows]
    .filter((row) => !row.amount.isZero())
    .sort((a, b) => b.amount.compare(a.amount));

  if (ranked.length <= keep) return ranked.map((r) => datum(r.label, r.amount));

  const rest = ranked
    .slice(keep)
    .reduce((total, row) => total.add(row.amount), Money.ZERO);
  return [
    ...ranked.slice(0, keep).map((r) => datum(r.label, r.amount)),
    datum(`Other (${ranked.length - keep})`, rest),
  ];
}

/** The periods the dashboard filter offers. */
export type DashboardRange = 'last12' | 'thisYear' | 'lastYear' | 'allDates';

export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: 'last12', label: 'Last 12 Months' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'lastYear', label: 'Last Year' },
  // What the book says since it was opened. The name is the one QuickBooks and
  // Zoho Books put on this control, and it reads as a period beside the three
  // above it. The party ledger keeps its own All Entries button, which clears a
  // filter rather than choosing a period.
  { value: 'allDates', label: 'All Dates' },
];

export function isDashboardRange(value: string): value is DashboardRange {
  return DASHBOARD_RANGES.some((range) => range.value === value);
}

/** The first and last date anything in the book is dated. */
export type BookSpan = { first: string; last: string };

/**
 * All Dates, as the two dates a period screen reads it over.
 *
 * It is a real range rather than an absent one, so every query, every chart and
 * every printed document goes on taking two dates and none of them learns about
 * a special case.
 *
 * The end is the later of the book's last entry and today. A bill dated ahead
 * is inside All Dates rather than dropped by the one range named for holding
 * everything. An empty book is today to today, which reads as zeroes rather
 * than as an error.
 *
 * Both the dashboard and the reports come through here, so the two screens
 * cannot come to different views of what All Dates means.
 */
export function allDatesRange(
  span: BookSpan | null,
  today: string,
): { from: string; to: string } {
  if (!span) return { from: today, to: today };
  // 'YYYY-MM-DD' text sorts as dates do, which is the whole reason rule 4 holds
  // dates as text end to end.
  return { from: span.first, to: span.last > today ? span.last : today };
}

/**
 * The range as two 'YYYY-MM-DD' dates, worked out from a date already in Dhaka
 * terms rather than from a JS Date built at the server's midnight.
 *
 * The span is only read for All Dates, and only the caller can fetch it: this
 * module is pure and stays that way.
 */
export function rangeFor(
  range: DashboardRange,
  today: string,
  span: BookSpan | null = null,
): { from: string; to: string; months: number } {
  const [year, month] = today.split('-').map(Number);
  if (!year || !month) return { from: today, to: today, months: 1 };

  if (range === 'allDates') {
    const { from, to } = allDatesRange(span, today);
    return { from, to, months: monthsBetween(from, to).length };
  }
  if (range === 'thisYear') {
    return { from: `${year}-01-01`, to: `${year}-12-31`, months: 12 };
  }
  if (range === 'lastYear') {
    const past = year - 1;
    return { from: `${past}-01-01`, to: `${past}-12-31`, months: 12 };
  }

  // Twelve months back including this one, so the current month is the last
  // column rather than a thirteenth.
  const startMonth = month - 11;
  const startYear = year + Math.floor((startMonth - 1) / 12);
  const normalized = ((((startMonth - 1) % 12) + 12) % 12) + 1;
  return {
    from: `${startYear}-${String(normalized).padStart(2, '0')}-01`,
    to: lastDayOf(year, month),
    months: 12,
  };
}

/** The last day of a month as 'YYYY-MM-DD'. Day zero of the next month. */
export function lastDayOf(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DAY = 86_400_000;

/** A date moved by whole days, built in UTC so no timezone can shift it. */
function shiftDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const at = new Date(Date.UTC(year, month - 1, day + days));
  return [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, '0'),
    String(at.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The period of the same length immediately before this one, which is what a
 * figure on the dashboard is compared against.
 *
 * Counted in days rather than in months, so it answers for a preset and for two
 * dates keyed by hand in the same way, and so the two periods touch without
 * overlapping: the previous one ends the day before this one starts.
 *
 * The arithmetic is done in UTC and the dates stay 'YYYY-MM-DD' text, per rule
 * 4. A JS Date built at the server's midnight would move a period end across a
 * day boundary against Asia/Dhaka.
 */
export function previousRange(
  from: string,
  to: string,
): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return { from, to };
  }
  const days = Math.round((end - start) / DAY) + 1;
  const previousTo = shiftDays(from, -1);
  return { from: shiftDays(previousTo, -(days - 1)), to: previousTo };
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** '2026-08' as 'Aug 26', which is what fits under a bar. */
export function shortMonth(period: string): string {
  const [year, month] = period.split('-');
  const name = MONTH_NAMES[Number(month) - 1];
  if (!name || !year) return period;
  return `${name} ${year.slice(2)}`;
}

/**
 * Every month in the range, so a month with no entries is a gap in the chart
 * rather than a month the axis skips over.
 */
export function monthsBetween(from: string, to: string): string[] {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) return [];

  const months: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  // Guarded rather than while(true): a bad range must not spin forever.
  for (let i = 0; i < 240; i++) {
    if (year > toYear || (year === toYear && month > toMonth)) break;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
