import Link from 'next/link';
import { CHART_SEQUENCE, type ShareDatum } from '@/lib/dashboard';
import { NoChartData } from './ChartCard';
import { shadeCss } from './shade';

/**
 * How old the money owed is, as one bar divided youngest to oldest, with the
 * buckets listed under it.
 *
 * One strip rather than a bar per bucket, because the question is how the
 * whole divides by age, and a single divided bar answers it at a glance: a
 * strip that darkens to the right is a book with old money in it. The buckets
 * keep their order and take the one-hue ramp light to dark, so age reads from
 * the shade without the legend; nothing here is red, because old is not the
 * same as overdue, and nothing in this book records a payment term.
 *
 * Every bucket is named with its figure and share beneath, so the strip's
 * segments are never the only way to read it. Segment widths come from
 * `value` as geometry only.
 */
export function AgeingStrip({
  title,
  headline,
  headlineNote,
  buckets,
  href,
  emptyMessage = 'Nothing outstanding',
}: {
  title: string;
  headline?: string;
  headlineNote?: string;
  /** Youngest first. */
  buckets: ShareDatum[];
  /** Where a bucket opens. */
  href?: string;
  emptyMessage?: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  // Spread the ramp across however many buckets there are, lightest first,
  // skipping the palest step: it is too close to the track to read as a part.
  const shade = (index: number) => {
    const steps = CHART_SEQUENCE.length - 1;
    const at =
      buckets.length <= 1
        ? steps
        : 1 + Math.round((index * (steps - 1)) / (buckets.length - 1));
    return CHART_SEQUENCE[Math.min(at, steps)] ?? 'var(--color-seq-4)';
  };

  return (
    <section className="card">
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
      {total <= 0 ? (
        <NoChartData>{emptyMessage}</NoChartData>
      ) : (
        <div className="px-5 pb-5 pt-4">
          <div
            className="track flex h-3.5 gap-[2px] overflow-hidden rounded-full"
            role="img"
            aria-label={buckets
              .map((bucket) => `${bucket.label} ${bucket.share}`)
              .join(', ')}
          >
            {buckets.map((bucket, index) =>
              bucket.value > 0 ? (
                <div
                  key={bucket.label}
                  title={`${bucket.label}: ${bucket.display} (${bucket.share})`}
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${(bucket.value / total) * 100}%`,
                    background: shadeCss(shade(index)),
                  }}
                />
              ) : null,
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {buckets.map((bucket, index) => {
              const body = (
                <>
                  <dt className="flex items-center gap-1.5 text-meta text-ink-2">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: shade(index) }}
                    />
                    {bucket.label}
                  </dt>
                  <dd className="figure mt-1 text-heading font-semibold text-ink">
                    {bucket.display}
                  </dd>
                  <dd className="figure text-meta text-ink-3">{bucket.share}</dd>
                </>
              );
              return href ? (
                <Link
                  key={bucket.label}
                  href={href}
                  className="-m-2 rounded-control p-2 transition-colors hover:bg-surface-2"
                >
                  {body}
                </Link>
              ) : (
                <div key={bucket.label}>{body}</div>
              );
            })}
          </dl>
        </div>
      )}
    </section>
  );
}
