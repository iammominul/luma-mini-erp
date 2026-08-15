'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS, type ChartDatum } from '@/lib/dashboard';
import { ChartCard, MoneyTooltip, NoChartData } from './ChartCard';

/**
 * Where the money going out went, as a share of the whole.
 *
 * The one place on this dashboard a ring is the right form. Part to whole, at a
 * glance, three segments. Everything else here is either a ranked comparison
 * (parties by balance) or an ordered scale (receivable ageing), and a ring
 * destroys both: rank becomes hard to read off arc lengths, and order stops
 * existing at all once the buckets are laid round a circle.
 *
 * Three is also the cap that keeps it honest. Past about six segments the small
 * ones stop being distinguishable and the thing to reach for is the bar chart
 * already next to it.
 *
 * The total sits in the middle rather than above, because the share and what it
 * is a share of are the same question, and the segments carry their own figures
 * so nothing here is told by color alone.
 */
export function CostSplitDonut({
  title,
  note,
  points,
  total,
  emptyMessage = 'Nothing paid out in this period',
}: {
  title: string;
  note?: string;
  /** Three at most, in the order they should be read. */
  points: ChartDatum[];
  /** Already formatted, as every figure that reaches a chart is. */
  total: string;
  emptyMessage?: string;
}) {
  const anything = points.some((point) => point.value > 0);
  const series = points.map((point, index) => ({
    key: point.label,
    label: point.label,
    color: CHART_COLORS[index] ?? CHART_COLORS[0]!,
  }));

  return (
    <ChartCard
      title={title}
      note={note}
      series={series}
      columns={['Cost', 'Amount']}
      rows={points.map((point) => ({
        label: point.label,
        values: [point.display],
      }))}
    >
      {anything ? (
        <div className="min-w-[300px]">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={points}
                dataKey="value"
                nameKey="label"
                innerRadius="58%"
                outerRadius="82%"
                startAngle={90}
                endAngle={-270}
                // The 2px gap between segments is the surface showing through,
                // which is what keeps two adjacent fills readable apart under
                // color blindness rather than relying on the hues alone.
                paddingAngle={2}
                stroke="var(--color-canvas)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {points.map((point, index) => (
                  <Cell
                    key={point.label}
                    fill={CHART_COLORS[index] ?? CHART_COLORS[0]}
                  />
                ))}
              </Pie>
              <Tooltip content={<MoneyTooltip series={series} />} />
              {/* The whole the segments are shares of, in the hole. */}
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                <tspan
                  x="50%"
                  dy="-0.6em"
                  className="fill-[var(--color-muted)]"
                  style={{ fontSize: 11 }}
                >
                  Total
                </tspan>
                <tspan
                  x="50%"
                  dy="1.5em"
                  className="fill-[var(--color-ink)]"
                  style={{ fontSize: 15, fontWeight: 600 }}
                >
                  {total}
                </tspan>
              </text>
            </PieChart>
          </ResponsiveContainer>

          {/* Every segment's own figure, beside its mark. The palette is only
              usable with these: two of its hues sit close under color
              blindness, so nothing may be told by color alone. */}
          <ul className="mt-2 space-y-1 px-1">
            {points.map((point, index) => (
              <li
                key={point.label}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: CHART_COLORS[index] ?? CHART_COLORS[0],
                    }}
                  />
                  <span className="truncate">{point.label}</span>
                </span>
                <span className="whitespace-nowrap font-medium">
                  {point.display}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <NoChartData>{emptyMessage}</NoChartData>
      )}
    </ChartCard>
  );
}
