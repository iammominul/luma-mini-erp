'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, type ChartSeries } from '@/lib/dashboard';
import { ChartCard, MoneyTooltip, NoChartData } from './ChartCard';

/**
 * A row per month, with a bar per series. Every point carries its figure twice:
 * `key` for the bar's length and `keyDisplay` for anything a reader sees.
 */
export type MonthPoint = { label: string } & Record<string, number | string>;

/**
 * Two or three measures a month, side by side on one axis.
 *
 * One axis, always. Billing, cost and margin are all taka, so a second scale
 * would let two very different months draw the same picture. Where a series can
 * go negative, as a margin can, a zero line is drawn so a loss reads as a bar
 * below it rather than as a short bar.
 */
export function GroupedMonthChart({
  title,
  note,
  series,
  points,
  emptyMessage = 'No entries in this period',
}: {
  title: string;
  note?: string;
  /** Up to three. Assigned the palette's hues in the order given. */
  series: { key: string; label: string }[];
  points: MonthPoint[];
  emptyMessage?: string;
}) {
  const colored: ChartSeries[] = series.map((item, index) => ({
    ...item,
    color: CHART_COLORS[index] ?? CHART_COLORS[0],
  }));

  const anything = points.some((point) =>
    series.some((item) => Number(point[item.key] ?? 0) !== 0),
  );
  const anyNegative = points.some((point) =>
    series.some((item) => Number(point[item.key] ?? 0) < 0),
  );

  return (
    <ChartCard
      title={title}
      note={note}
      series={colored}
      columns={['Month', ...series.map((item) => item.label)]}
      rows={points.map((point) => ({
        label: String(point.label),
        values: series.map((item) => String(point[`${item.key}Display`] ?? '')),
      }))}
    >
      {anything ? (
        // A month chart needs room per column, so this keeps a floor that fits
        // a phone and scrolls inside its own card only when the range is long.
        <div className="min-w-[320px]">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
              barGap={2}
            >
              <CartesianGrid
                stroke="var(--color-line)"
                strokeDasharray="2 2"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                stroke="var(--color-line)"
                tickLine={false}
              />
              {/* Compressed to lakh, because a full 6,43,798.00 on every
                  gridline is unreadable. The exact figure is in the tooltip
                  and in the table view. */}
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                stroke="var(--color-line)"
                tickLine={false}
                width={52}
                tickFormatter={(value: number) =>
                  value === 0 ? '0' : `${Math.round(value / 100000)}L`
                }
              />
              {anyNegative ? (
                <ReferenceLine y={0} stroke="var(--color-ink)" />
              ) : null}
              <Tooltip
                cursor={{ fill: 'rgba(20, 43, 64, 0.05)' }}
                content={<MoneyTooltip series={colored} />}
              />
              {colored.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  fill={item.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <NoChartData>{emptyMessage}</NoChartData>
      )}
    </ChartCard>
  );
}
