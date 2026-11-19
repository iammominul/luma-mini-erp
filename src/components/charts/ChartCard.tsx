'use client';

import { useState } from 'react';
import type { ChartDatum, ChartSeries } from '@/lib/dashboard';
import { Table, Td, Th } from '../ui';

/**
 * Which series of a chart are switched off, and which one the pointer is on.
 *
 * Kept by the chart rather than the card, because the chart is what has to
 * redraw. A series switched off keeps its color: color follows the series, not
 * its place in what is left, so the survivors never repaint.
 */
export function useSeriesFocus() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  return {
    hidden,
    hovered,
    setHovered,
    toggle: (key: string, all: string[]) =>
      setHidden((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        // The last visible series cannot be switched off: an empty plot reads
        // as a book with nothing in it.
        else if (all.filter((k) => !next.has(k)).length > 1) next.add(key);
        return next;
      }),
  };
}

/** How strongly a series draws while another one is being pointed at. */
export function seriesOpacity(key: string, hovered: string | null): number {
  return hovered === null || hovered === key ? 1 : 0.25;
}

/**
 * The frame every chart on the dashboard sits in.
 *
 * It owns the two things the palette obliges: a legend whenever there is more
 * than one series, so identity is never carried by color alone, and a table
 * view. The table is not a nicety. Two of the four hues sit close enough under
 * color blindness, and the gold close enough to white, that the validated
 * palette is only usable with visible figures beside the marks. It also happens
 * to be what somebody in an office wants half the time: the numbers.
 *
 * The legend is also the series switch. Pressing an entry hides or shows that
 * series, and pointing at one fades the others, so one measure can be read on
 * its own without a second chart.
 */
export function ChartCard({
  title,
  note,
  headline,
  headlineNote,
  series,
  focus,
  rows,
  columns,
  children,
}: {
  title: string;
  note?: string;
  /**
   * The one figure the chart is about, set large under the title: the
   * period's gross margin over a margin chart, the total over a donut. It is
   * worked out on the server like every figure; the chart under it is the
   * shape of that number.
   */
  headline?: string;
  /** A short line beside the headline: its share, or what it is of. */
  headlineNote?: React.ReactNode;
  /** Named for the legend. One series needs none: the title says what it is. */
  series?: ChartSeries[];
  /** The chart's series state, when its legend can switch series. */
  focus?: ReturnType<typeof useSeriesFocus>;
  /** The figures behind the chart, for the table view. */
  rows: { label: string; values: string[] }[];
  columns: string[];
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const keys = series?.map((item) => item.key) ?? [];

  return (
    <section className="card flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-body font-medium text-ink-2">{title}</h2>
          {headline ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="figure text-number font-semibold tracking-[-0.02em] text-ink">
                {headline}
              </span>
              {headlineNote ? (
                <span className="text-meta text-ink-3">{headlineNote}</span>
              ) : null}
            </div>
          ) : null}
          {note ? <p className="mt-1 text-meta text-ink-3">{note}</p> : null}
        </div>
        {/* A segmented control: two states of one view, the way every modern
            tool switches a chart to its numbers. */}
        <div
          role="group"
          aria-label="View"
          className="inline-flex shrink-0 rounded-control bg-surface-3 p-0.5 text-meta"
        >
          {(['Chart', 'Table'] as const).map((view) => {
            const active = (view === 'Table') === showTable;
            return (
              <button
                key={view}
                type="button"
                aria-pressed={active}
                onClick={() => setShowTable(view === 'Table')}
                className={`rounded-[5px] px-2.5 py-0.5 font-medium transition-colors ${
                  active
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1)]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                {view}
              </button>
            );
          })}
        </div>
      </div>

      {showTable ? (
        <div className="mt-3 border-t border-rule-soft">
          <Table>
            <thead>
              <tr>
                <Th>{columns[0]}</Th>
                {columns.slice(1).map((column) => (
                  <Th key={column} numeric>
                    {column}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <Td>{row.label}</Td>
                  {row.values.map((value, i) => (
                    <Td key={columns[i + 1] ?? String(i)} numeric>
                      {value}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 px-5 pb-4 pt-3">
          {series && series.length > 1 ? (
            <div className="-ml-1.5 mb-2 flex flex-wrap items-center gap-0.5">
              {series.map((item) => {
                const off = focus?.hidden.has(item.key) ?? false;
                const swatch = (
                  <span
                    aria-hidden
                    className={
                      item.kind === 'line'
                        ? 'inline-block h-[3px] w-3.5 rounded-full'
                        : 'inline-block h-2.5 w-2.5 rounded-[3px]'
                    }
                    style={{ background: off ? 'var(--color-rule)' : item.color }}
                  />
                );
                if (!focus) {
                  return (
                    <span
                      key={item.key}
                      className="flex items-center gap-1.5 px-1.5 text-meta text-ink-2"
                    >
                      {swatch}
                      {item.label}
                    </span>
                  );
                }
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={!off}
                    title={off ? `Show ${item.label}` : `Hide ${item.label}`}
                    onClick={() => focus.toggle(item.key, keys)}
                    onMouseEnter={() => !off && focus.setHovered(item.key)}
                    onMouseLeave={() => focus.setHovered(null)}
                    onFocus={() => !off && focus.setHovered(item.key)}
                    onBlur={() => focus.setHovered(null)}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-meta transition-colors hover:bg-surface-2 ${
                      off ? 'text-ink-3 line-through' : 'text-ink-2'
                    }`}
                  >
                    {swatch}
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {/* Wide charts scroll inside their own box rather than pushing the
              page sideways on a narrow screen. */}
          <div className="overflow-x-auto">{children}</div>
        </div>
      )}
    </section>
  );
}

/**
 * The tooltip every chart uses.
 *
 * It reads the formatted figure carried on the datum. Recharts hands over the
 * plain number it drew the bar from, and that number is never shown: it has no
 * thousands separators, no two decimal places, and no business being read as
 * money.
 *
 * The figure leads and the series name follows, the legend's order turned
 * round, because whoever is pointing already knows the series and wants the
 * number. `action` names where a click goes, on a chart where it goes anywhere.
 */
export function MoneyTooltip({
  active,
  payload,
  label,
  series,
  hidden,
  action,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; payload?: Record<string, unknown> }[];
  label?: string | number;
  series: ChartSeries[];
  hidden?: ReadonlySet<string>;
  action?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown> | undefined;
  if (!row) return null;
  const clickable = Boolean(action && row.href);

  return (
    <div className="pop min-w-[200px] px-3 py-2.5 text-meta">
      <div className="mb-1.5 font-semibold text-ink">
        {String(label ?? row.label ?? '')}
      </div>
      {series.map((item) => {
        if (hidden?.has(item.key)) return null;
        const display = row[`${item.key}Display`];
        if (typeof display !== 'string') return null;
        return (
          <div key={item.key} className="flex items-center gap-2 py-px">
            <span
              aria-hidden
              className="inline-block h-0.5 w-2.5 rounded-full"
              style={{ background: item.color }}
            />
            <span className="figure font-semibold text-ink">
              {display}
            </span>
            <span className="ml-auto pl-3 text-ink-3">
              {item.label}
            </span>
          </div>
        );
      })}
      {clickable ? (
        <div className="mt-2 border-t border-rule-soft pt-1.5 text-caption font-medium text-navy">
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** A chart with nothing in it says so, rather than drawing empty axes. */
export function NoChartData({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-ink-3">
      {children}
    </div>
  );
}

export type { ChartDatum };
