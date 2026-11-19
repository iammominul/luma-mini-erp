/**
 * What every screen shows while its figures are read.
 *
 * One file at the group's root covers all sixty screens: a route with no
 * loading boundary of its own falls back to the nearest one above it. Before
 * this, a click on the rail left the old screen sitting there with nothing to
 * say it had been heard, and the database is far enough away that the wait is
 * long enough to click twice.
 *
 * It draws the shape every screen shares, the head and a register, in the
 * geometry PageTitle and Table use, so the real screen lands in place rather
 * than pushing the page about. Shapes only and no shimmer: see `skeleton` in
 * globals.css.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-4 border-b border-rule pb-2.5 md:pb-2 md:pt-5">
        <div className="skeleton h-2.5 w-24" />
        <div className="skeleton mt-2 h-4 w-56" />
      </div>
      <div className="rounded border border-rule bg-white">
        <div className="flex h-[26px] items-center gap-6 border-b border-rule bg-surface-2 px-[9px]">
          {[16, 28, 20, 14].map((width, i) => (
            <div key={i} className="skeleton h-2" style={{ width: `${width}%` }} />
          ))}
        </div>
        {Array.from({ length: 10 }, (_, row) => (
          <div
            key={row}
            className="flex h-(--row) items-center gap-6 border-b border-rule-soft px-[9px] last:border-b-0"
          >
            {[16, 28, 20, 14].map((width, i) => (
              <div
                key={i}
                className="skeleton h-2"
                style={{ width: `${width - ((row * 3 + i * 5) % 7)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
