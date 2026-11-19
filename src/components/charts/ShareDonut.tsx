'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  CHART_COLORS,
  CHART_OTHER_COLOR,
  type ShareDatum,
} from '@/lib/dashboard';
import { ChartCard, NoChartData } from './ChartCard';
import { ShadeDefs, shadeUrl, useChartId } from './depth';

/**
 * How a whole divides, as a donut with its parts listed beside it.
 *
 * A donut earns its place for exactly one question, the part of a whole, and
 * only while the parts are few: `foldToShares` keeps four and folds the rest
 * into Other, which is the cap the palette validated for and inside the six a
 * donut can carry. For comparing close figures a bar is better, which is why
 * this is used for the period's costs and nowhere else.
 *
 * The list beside it is not decoration. It names every part with its figure and
 * share, so no part is identified by color alone: two of the hues sit close
 * under color blindness and the gold is light against white, and both need the
 * label. Pointing at a slice lights its row and the reverse, and a click on
 * either opens the documents behind it.
 *
 * Every figure arrives formatted, and the total in the middle is worked out as
 * Money on the server. `value` sets only the angle of a slice.
 */
export function ShareDonut({
  title,
  note,
  columnLabel,
  slices,
  totalDisplay,
  totalLabel = 'Total',
  emptyMessage = 'Nothing recorded in this period',
}: {
  title: string;
  note?: string;
  columnLabel: string;
  slices: ShareDatum[];
  totalDisplay: string;
  totalLabel?: string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const shade = useChartId();

  const colorFor = (index: number, label: string) =>
    label.startsWith('Other')
      ? CHART_OTHER_COLOR
      : (CHART_COLORS[index] ?? CHART_OTHER_COLOR);
  const dim = (index: number) =>
    hovered === null || hovered === index ? 1 : 0.3;

  return (
    <ChartCard
      title={title}
      note={note}
      columns={[columnLabel, 'Amount', 'Share']}
      rows={slices.map((slice) => ({
        label: slice.label,
        values: [slice.display, slice.share],
      }))}
    >
      {slices.length > 0 ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="chart-depth relative h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <ShadeDefs
                  prefix={shade}
                  kind="diagonal"
                  colors={slices.map((slice, index) => colorFor(index, slice.label))}
                />
                {/* The recessed well the ring sits in, drawn first and a few
                    pixels wider, so the slices read as standing on it. */}
                <Pie
                  data={[{ value: 1 }]}
                  dataKey="value"
                  innerRadius={69}
                  outerRadius={95}
                  fill="var(--color-surface-3)"
                  stroke="none"
                  isAnimationActive={false}
                  tooltipType="none"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const slice = payload?.[0]?.payload as
                      | ShareDatum
                      | undefined;
                    // The well under the ring is a pie too; it has no label
                    // and nothing to say.
                    if (!active || !slice?.label) return null;
                    return (
                      <div className="pop px-3 py-2 text-meta">
                        <div className="font-semibold">{slice.label}</div>
                        <div className="figure mt-0.5 font-semibold">
                          {slice.display}
                          <span className="ml-2 font-normal text-ink-3">
                            {slice.share}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={72}
                  outerRadius={92}
                  cornerRadius={4}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  // A gap between slices, so two neighbors of close hue still
                  // read as two. The gap is the padding angle; no outline.
                  stroke="none"
                  animationDuration={500}
                  onMouseEnter={(_, index) => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(_, index) => {
                    const href = slices[index]?.href;
                    if (href) router.push(href);
                  }}
                >
                  {slices.map((slice, index) => (
                    <Cell
                      key={slice.label}
                      fill={shadeUrl(shade, index)}
                      fillOpacity={dim(index)}
                      cursor={slice.href ? 'pointer' : undefined}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* The whole, in the hole. Under the pointer it becomes the part
                being pointed at, so the figure and the slice are read together. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="eyebrow">
                {hovered === null
                  ? totalLabel
                  : (slices[hovered]?.share ?? totalLabel)}
              </span>
              <span className="figure mt-0.5 text-title font-semibold tracking-[-0.02em] text-ink">
                {hovered === null
                  ? totalDisplay
                  : (slices[hovered]?.display ?? totalDisplay)}
              </span>
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 text-body">
            {slices.map((slice, index) => {
              const body = (
                <>
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: colorFor(index, slice.label) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                  <span className="figure shrink-0 font-medium">
                    {slice.display}
                  </span>
                  <span className="figure w-12 shrink-0 text-right text-ink-3">
                    {slice.share}
                  </span>
                </>
              );
              const rowClass = `flex items-center gap-2 border-b border-rule-soft px-1.5 py-1.5 last:border-b-0 ${
                hovered === index ? 'bg-surface-2' : ''
              }`;
              return (
                <li
                  key={slice.label}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {slice.href ? (
                    <Link
                      href={slice.href}
                      className={`${rowClass} hover:text-navy`}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(null)}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <NoChartData>{emptyMessage}</NoChartData>
      )}
    </ChartCard>
  );
}
