'use client';

import { useRouter } from 'next/navigation';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, type ChartSeries } from '@/lib/dashboard';
import {
  ChartCard,
  MoneyTooltip,
  NoChartData,
  seriesOpacity,
  useSeriesFocus,
} from './ChartCard';
import { ShadeDefs, shadeUrl, useChartId } from './depth';

/**
 * A row per month, with a figure per series. Every point carries its figure
 * twice: `key` for the mark's geometry and `keyDisplay` for anything a reader
 * sees. `href`, when present, is where a click on that month goes.
 */
export type MonthPoint = { label: string; href?: string } & Record<
  string,
  number | string | undefined
>;

/**
 * Two or three measures a month on one axis: bars for amounts set side by
 * side, a line for the one series read as a trend over them, an area for a
 * measure read as a flow across the months.
 *
 * One axis, always. Billing, cost and margin are all taka, so a second scale
 * would let two very different months draw the same picture. Where a series can
 * go negative, as a margin can, a zero line is drawn so a loss reads as a mark
 * below it rather than as a short bar.
 *
 * Interactive in three ways, none of which hides a figure: the legend switches
 * a series off and fades the others while pointed at, the tooltip lists every
 * series in the month, and a click on a month opens the documents behind it.
 * Every figure is also in the table view, so nothing depends on a pointer.
 */
export function GroupedMonthChart({
  title,
  note,
  headline,
  headlineNote,
  series,
  points,
  action,
  height = 240,
  emptyMessage = 'No entries in this period',
}: {
  title: string;
  note?: string;
  headline?: string;
  headlineNote?: React.ReactNode;
  /**
   * Up to three. Each takes the palette's hues in the order given unless it
   * names its own token, which is how a comparison series takes the lighter
   * step of the first hue.
   */
  series: {
    key: string;
    label: string;
    kind?: 'bar' | 'line' | 'area';
    color?: string;
  }[];
  points: MonthPoint[];
  /** What a click on a month opens, named in the tooltip. */
  action?: string;
  height?: number;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const focus = useSeriesFocus();
  const shade = useChartId();
  const fade = `${shade}f`;
  const colored: ChartSeries[] = series.map((item, index) => ({
    ...item,
    color: item.color ?? CHART_COLORS[index] ?? CHART_COLORS[0],
  }));

  const anything = points.some((point) =>
    series.some((item) => Number(point[item.key] ?? 0) !== 0),
  );
  const anyNegative = points.some((point) =>
    series.some((item) => Number(point[item.key] ?? 0) < 0),
  );
  const clickable = points.some((point) => point.href);
  const bars = colored.filter((item) => (item.kind ?? 'bar') === 'bar').length;

  return (
    <ChartCard
      title={title}
      note={note}
      headline={headline}
      headlineNote={headlineNote}
      series={colored}
      focus={focus}
      columns={['Month', ...series.map((item) => item.label)]}
      rows={points.map((point) => ({
        label: String(point.label),
        values: series.map((item) => String(point[`${item.key}Display`] ?? '')),
      }))}
    >
      {anything ? (
        // A month chart needs room per column, so this keeps a floor that fits
        // a phone and scrolls inside its own card only when the range is long.
        <div
          className="chart-depth min-w-[320px]"
          style={{ cursor: clickable ? 'pointer' : undefined }}
        >
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 4, bottom: 0, left: -8 }}
              barGap={3}
              barCategoryGap={bars > 1 ? '26%' : '38%'}
              onClick={(state) => {
                const index = Number(state?.activeIndex);
                const href = Number.isInteger(index)
                  ? points[index]?.href
                  : undefined;
                if (href) router.push(href);
              }}
            >
              <ShadeDefs
                prefix={shade}
                colors={colored.map((item) => item.color)}
              />
              <ShadeDefs
                prefix={fade}
                kind="fade"
                colors={colored.map((item) => item.color)}
              />
              <CartesianGrid
                stroke="var(--color-rule-soft)"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              {/* Compressed to lakh, because a full 6,43,798.00 on every
                  gridline is unreadable. The exact figure is in the tooltip
                  and in the table view. */}
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickCount={5}
                tickFormatter={(value: number) =>
                  value === 0 ? '0' : `${Math.round(value / 100000)}L`
                }
              />
              {anyNegative ? (
                <ReferenceLine y={0} stroke="var(--color-ink-3)" />
              ) : null}
              <Tooltip
                cursor={{ fill: 'rgb(20 43 64 / 0.04)' }}
                content={
                  <MoneyTooltip
                    series={colored}
                    hidden={focus.hidden}
                    action={action}
                  />
                }
              />
              {colored.map((item, index) => {
                const hide = focus.hidden.has(item.key);
                const opacity = seriesOpacity(item.key, focus.hovered);
                if (item.kind === 'area') {
                  return (
                    <Area
                      key={item.key}
                      dataKey={item.key}
                      hide={hide}
                      type="monotone"
                      stroke={item.color}
                      strokeWidth={2}
                      strokeOpacity={opacity}
                      fill={shadeUrl(fade, index)}
                      fillOpacity={opacity}
                      dot={false}
                      activeDot={{
                        r: 4.5,
                        fill: item.color,
                        stroke: 'var(--color-surface)',
                        strokeWidth: 2,
                      }}
                      animationDuration={500}
                    />
                  );
                }
                if (item.kind === 'line') {
                  return (
                    <Line
                      key={item.key}
                      dataKey={item.key}
                      hide={hide}
                      type="monotone"
                      stroke={item.color}
                      strokeWidth={2.5}
                      strokeOpacity={opacity}
                      // No point marks at rest: the line is the trend, and a
                      // dot on every month is a scatter drawn over it. The
                      // month under the pointer gets one.
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: item.color,
                        stroke: 'var(--color-surface)',
                        strokeWidth: 2,
                      }}
                      animationDuration={500}
                    />
                  );
                }
                return (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    hide={hide}
                    fill={shadeUrl(shade, index)}
                    fillOpacity={opacity}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={bars > 1 ? 14 : 24}
                    animationDuration={500}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <NoChartData>{emptyMessage}</NoChartData>
      )}
    </ChartCard>
  );
}
