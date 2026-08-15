'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_COLORS,
  CHART_OTHER_COLOR,
  type ChartDatum,
  type ChartSeries,
} from '@/lib/dashboard';
import { ChartCard, MoneyTooltip, NoChartData } from './ChartCard';
import { useIsWide } from '../use-is-wide';

/** As much of a category name as fits beside a bar on a phone. */
const shorten = (label: string, wide: boolean) =>
  wide || label.length <= 14 ? label : `${label.slice(0, 13)}...`;

export type CategoryPoint = ChartDatum;

/**
 * One measure across a handful of named things, drawn as horizontal bars.
 *
 * Horizontal rather than a pie: a category name reads straight across at the
 * end of its own bar, ten slices of a pie do not, and comparing lengths is
 * something people are good at while comparing angles is not.
 *
 * Every bar carries its figure as a label. That is the secondary encoding the
 * palette needs, and it means a reader never has to work out which shade is
 * which to know what the chart says.
 */
export function CategoryBarChart({
  title,
  note,
  columnLabel,
  valueLabel,
  points,
  /** One color for every bar, when the bars are one measure and not categories. */
  singleColor,
  emptyMessage = 'Nothing recorded in this period',
}: {
  title: string;
  note?: string;
  columnLabel: string;
  valueLabel: string;
  points: CategoryPoint[];
  singleColor?: boolean;
  emptyMessage?: string;
}) {
  // One series, so no legend: the title says what is being measured. Identity
  // here is the axis label beside each bar, which is text, not color.
  const series: ChartSeries[] = [
    { key: 'value', label: valueLabel, color: CHART_COLORS[0] },
  ];

  // The tooltip reads the formatted figure off `${key}Display`, so the one
  // series here carries its display string under the name that key implies.
  const wide = useIsWide();
  const data = points.map((point) => ({ ...point, valueDisplay: point.display }));

  const colorFor = (index: number, label: string) => {
    if (singleColor) return CHART_COLORS[0];
    if (label.startsWith('Other')) return CHART_OTHER_COLOR;
    // Assigned in fixed order and never cycled: past the fourth, a bar takes
    // the reserved gray rather than a hue that repeats one already on screen.
    return CHART_COLORS[index] ?? CHART_OTHER_COLOR;
  };

  return (
    <ChartCard
      title={title}
      note={note}
      columns={[columnLabel, valueLabel]}
      rows={points.map((point) => ({
        label: point.label,
        values: [point.display],
      }))}
    >
      {points.length > 0 ? (
        // The name column and the room kept for the value label both give way
        // on a phone, so the chart fits 320px rather than scrolling sideways
        // inside its card. The full name is in the tooltip and the table view.
        <div className="min-w-[300px]">
          <ResponsiveContainer
            width="100%"
            height={Math.max(160, points.length * 42 + 24)}
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: wide ? 92 : 76, bottom: 4, left: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={wide ? 132 : 84}
                tickFormatter={(label: string) => shorten(label, wide)}
                tick={{ fontSize: 11, fill: 'var(--color-ink)' }}
                stroke="var(--color-line)"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(20, 43, 64, 0.05)' }}
                content={<MoneyTooltip series={series} />}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {points.map((point, index) => (
                  <Cell
                    key={point.label}
                    fill={colorFor(index, point.label)}
                  />
                ))}
                {/* The figure sits at the end of its own bar: the relief the
                    palette requires, and what an office reader wants anyway. */}
                <LabelList
                  dataKey="display"
                  position="right"
                  className="fill-[var(--color-ink)]"
                  style={{ fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <NoChartData>{emptyMessage}</NoChartData>
      )}
    </ChartCard>
  );
}
