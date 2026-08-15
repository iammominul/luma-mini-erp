import Link from 'next/link';
import { Button } from '@/components/ui';
import { lastDayOf } from '@/lib/dashboard';
import { formatDate, todayInDhaka } from '@/lib/dates';

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

export function readRange(params: {
  from?: string;
  to?: string;
}): ReportRange {
  const fallback = defaultRange();
  const valid = (value: string | undefined): string | null =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const from = valid(params.from) ?? fallback.from;
  const to = valid(params.to) ?? fallback.to;
  // A range keyed backwards is a typo, not an empty report. Swapping it shows
  // what the person meant instead of a page of zeroes they have to work out.
  return from <= to ? { from, to } : { from: to, to: from };
}

export function rangeLabel(range: ReportRange): string {
  return `${formatDate(range.from)} to ${formatDate(range.to)}`;
}

/** A few ranges worth one click, since these are the ones actually asked for. */
function shortcuts(): { label: string; range: ReportRange }[] {
  const today = todayInDhaka();
  const [year, month] = today.split('-').map(Number);
  if (!year || !month) return [];
  const financialYearStart = month >= 7 ? year : year - 1;
  return [
    {
      label: 'This Month',
      range: { from: `${year}-${String(month).padStart(2, '0')}-01`, to: today },
    },
    {
      label: 'This Financial Year',
      range: { from: `${financialYearStart}-07-01`, to: today },
    },
    {
      label: 'Last Financial Year',
      range: {
        from: `${financialYearStart - 1}-07-01`,
        to: lastDayOf(financialYearStart, 6),
      },
    },
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
            href={`${basePath}?from=${shortcut.range.from}&to=${shortcut.range.to}`}
            className="rounded border border-[var(--color-line)] px-2.5 py-1.5 text-xs hover:bg-gray-50"
          >
            {shortcut.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
