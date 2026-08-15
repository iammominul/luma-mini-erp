'use client';

import { useState } from 'react';
import type { ChartDatum, ChartSeries } from '@/lib/dashboard';
import { Card, CardHeader, Table, Td, Th } from '../ui';

/**
 * The frame every chart on the dashboard sits in.
 *
 * It owns the two things the palette obliges: a legend whenever there is more
 * than one series, so identity is never carried by color alone, and a table
 * view. The table is not a nicety. Two of the four hues sit close enough under
 * color blindness, and the gold close enough to white, that the validated
 * palette is only usable with visible figures beside the marks. It also happens
 * to be what somebody in an office wants half the time: the numbers.
 */
export function ChartCard({
  title,
  note,
  series,
  rows,
  columns,
  children,
}: {
  title: string;
  note?: string;
  /** Named for the legend. One series needs none: the title says what it is. */
  series?: ChartSeries[];
  /** The figures behind the chart, for the table view. */
  rows: { label: string; values: string[] }[];
  columns: string[];
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <button
            type="button"
            onClick={() => setShowTable((current) => !current)}
            className="text-sm text-[var(--color-navy)] hover:underline"
          >
            {showTable ? 'View as Chart' : 'View as Table'}
          </button>
        }
      />

      {note ? (
        <div className="px-4 pt-3 text-xs text-[var(--color-muted)]">{note}</div>
      ) : null}

      {showTable ? (
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
      ) : (
        <div className="p-4">
          {series && series.length > 1 ? (
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {series.map((item) => (
                <span
                  key={item.key}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
          {/* Wide charts scroll inside their own box rather than pushing the
              page sideways on a narrow screen. */}
          <div className="overflow-x-auto">{children}</div>
        </div>
      )}
    </Card>
  );
}

/**
 * The tooltip every chart uses.
 *
 * It reads the formatted figure carried on the datum. Recharts hands over the
 * plain number it drew the bar from, and that number is never shown: it has no
 * thousands separators, no two decimal places, and no business being read as
 * money.
 */
export function MoneyTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; payload?: Record<string, unknown> }[];
  label?: string | number;
  series: ChartSeries[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown> | undefined;
  if (!row) return null;

  return (
    <div className="rounded border border-[var(--color-line)] bg-white px-2.5 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{String(label ?? '')}</div>
      {series.map((item) => {
        const display = row[`${item.key}Display`];
        if (typeof display !== 'string') return null;
        return (
          <div key={item.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: item.color }}
            />
            <span className="text-[var(--color-muted)]">{item.label}</span>
            <span className="ml-auto font-medium tabular-nums">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A chart with nothing in it says so, rather than drawing empty axes. */
export function NoChartData({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-[var(--color-muted)]">
      {children}
    </div>
  );
}

export type { ChartDatum };
