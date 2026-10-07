import Link from 'next/link';
import type { ShareDatum } from '@/lib/dashboard';
import { NoChartData } from './ChartCard';
import { shadeCss } from './shade';

/**
 * A short ranked list with a thin bar under each name: the period's top
 * customers, largest first.
 *
 * Built in plain markup rather than as a chart. A horizontal bar chart put the
 * name in a squeezed axis column that wrapped long company names onto two
 * lines and set the figure in 11px beside the bar; here the name, the figure
 * and the share are ordinary text in the type scale, and the bar is a quiet
 * gauge under them that says how the rows compare. Every figure is visible, so
 * there is nothing for a table view to add.
 *
 * The bar's length comes from `value`, which is geometry and nothing else.
 * The figure and the share are worked out as Money on the server.
 */
export function RankedList({
  title,
  headline,
  headlineNote,
  rows,
  emptyMessage = 'Nothing in this period',
}: {
  title: string;
  headline?: string;
  headlineNote?: string;
  rows: ShareDatum[];
  emptyMessage?: string;
}) {
  const largest = Math.max(...rows.map((row) => row.value), 0);

  return (
    <section className="card flex flex-col">
      <div className="px-5 pt-4">
        <h2 className="text-body font-medium text-ink-2">{title}</h2>
        {headline ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="figure text-number font-semibold tracking-[-0.02em] text-ink">
              {headline}
            </span>
            {headlineNote ? (
              <span className="text-meta text-ink-3">{headlineNote}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <NoChartData>{emptyMessage}</NoChartData>
      ) : (
        <ol className="flex-1 px-5 pb-4 pt-3">
          {rows.map((row, index) => {
            const width = largest > 0 ? (row.value / largest) * 100 : 0;
            const body = (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="figure w-4 shrink-0 text-meta text-ink-3">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-ink group-hover:text-navy">
                    {row.label}
                  </span>
                  <span className="figure shrink-0 text-body font-semibold text-ink">
                    {row.display}
                  </span>
                  <span className="figure w-12 shrink-0 text-right text-meta text-ink-3">
                    {row.share}
                  </span>
                </div>
                <div className="track ml-7 mt-1.5 h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full shadow-[0_1px_1px_rgb(20_43_64/0.2)] transition-[width,filter] duration-500 group-hover:brightness-110"
                    style={{
                      width: `${Math.max(width, 1.5)}%`,
                      background: shadeCss('var(--color-chart-1)'),
                    }}
                  />
                </div>
              </>
            );
            return (
              <li
                key={row.label}
                className="border-b border-rule-soft py-2.5 last:border-b-0"
              >
                {row.href ? (
                  <Link href={row.href} className="group block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
