import Link from 'next/link';
import { Button } from '@/components/ui';
import { allDatesRange, lastDayOf } from '@/lib/dashboard';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { bookSpan } from '@/lib/queries';

/**
 * The date range every report is read over.
 *
 * A plain form posting to the same page with search params, so a report stays a
 * server component: no chart data is fetched from the browser, the range
 * survives a reload, and a range can be bookmarked or pasted to somebody else.
 *
 * The dates are 'YYYY-MM-DD' text end to end, as everywhere else here. A range
 * built from a JS Date would be constructed at the server's midnight and could
 * put a bill in the wrong month against Asia/Dhaka.
 */
export type ReportRange = { from: string; to: string };

/** A range, and whether it was asked for as the whole book. */
export type ResolvedRange = ReportRange & { allDates: boolean };

/** This financial year so far, which is what a report defaults to. */
export function defaultRange(): ReportRange {
  const today = todayInDhaka();
  const [year, month] = today.split('-').map(Number);
  if (!year || !month) return { from: today, to: today };
  // The Bangladesh financial year runs July to June, so before July the year
  // being reported on started in the previous calendar year.
  const startYear = month >= 7 ? year : year - 1;
  return { from: `${startYear}-07-01`, to: today };
}

export function readRange(params: { from?: string; to?: string }): ReportRange {
  const fallback = defaultRange();
  const valid = (value: string | undefined): string | null =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const from = valid(params.from) ?? fallback.from;
  const to = valid(params.to) ?? fallback.to;
  // A range keyed backwards is a typo, not an empty report. Swapping it shows
  // what the person meant instead of a page of zeroes they have to work out.
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * The range a report is being read over, with All Dates resolved.
 *
 * All Dates is asked for as `?range=all` rather than as two dates worked out
 * when the link was drawn, so a report someone bookmarked still means all dates
 * next month instead of freezing on the day it was bookmarked. It costs a round
 * trip to the book, and only that one view pays it.
 *
 * Two dates keyed by hand always win: somebody who asks for a period has asked
 * for that period.
 */
export async function resolveRange(params: {
  from?: string;
  to?: string;
  range?: string;
}): Promise<ResolvedRange> {
  const keyed = Boolean(params.from || params.to);
  if (params.range === 'all' && !keyed) {
    const span = await bookSpan();
    return { ...allDatesRange(span, todayInDhaka()), allDates: true };
  }
  return { ...readRange(params), allDates: false };
}

export function rangeLabel(range: ReportRange | ResolvedRange): string {
  const dates = `${formatDate(range.from)} to ${formatDate(range.to)}`;
  // The name and the period both, because a figure quoted off an All Dates
  // report still has to be tied to the dates it covers.
  return 'allDates' in range && range.allDates ? `All Dates (${dates})` : dates;
}

/**
 * A few ranges worth one click, since these are the ones actually asked for.
 *
 * Three of them carry their dates in the link, because a financial year is the
 * same two dates whoever opens it. All Dates carries its name instead, for the
 * reason on resolveRange.
 */
function shortcuts(): { label: string; query: string }[] {
  const today = todayInDhaka();
  const [year, month] = today.split('-').map(Number);
  if (!year || !month) return [];
  const financialYearStart = month >= 7 ? year : year - 1;
  const dates = (range: ReportRange) => `from=${range.from}&to=${range.to}`;
  return [
    {
      label: 'This Month',
      query: dates({
        from: `${year}-${String(month).padStart(2, '0')}-01`,
        to: today,
      }),
    },
    {
      label: 'This Financial Year',
      query: dates({ from: `${financialYearStart}-07-01`, to: today }),
    },
    {
      label: 'Last Financial Year',
      query: dates({
        from: `${financialYearStart - 1}-07-01`,
        to: lastDayOf(financialYearStart, 6),
      }),
    },
    { label: 'All Dates', query: 'range=all' },
  ];
}

export function RangePicker({
  basePath,
  range,
}: {
  basePath: string;
  range: ReportRange;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-[var(--color-line)] bg-white p-3">
      <form action={basePath} className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--color-muted)]">
          <span className="mb-1 block font-medium">From</span>
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="rounded border border-[var(--color-line)] px-2 py-1.5 text-sm text-[var(--color-ink)]"
          />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          <span className="mb-1 block font-medium">To</span>
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="rounded border border-[var(--color-line)] px-2 py-1.5 text-sm text-[var(--color-ink)]"
          />
        </label>
        <Button type="submit">Show</Button>
      </form>

      <div className="flex flex-wrap items-center gap-1">
        {shortcuts().map((shortcut) => (
          <Link
            key={shortcut.label}
            href={`${basePath}?${shortcut.query}`}
            className="rounded border border-[var(--color-line)] px-2.5 py-1.5 text-xs hover:bg-gray-50"
          >
            {shortcut.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
