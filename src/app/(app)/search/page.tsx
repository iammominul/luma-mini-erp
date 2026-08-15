import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Notice, PageTitle } from '@/components/ui';
import { searchRecords, type SearchHitKind } from '@/lib/queries';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * One box that resolves a number, as the full ERP specifies in D36.
 *
 * A page rather than a dialog, and deliberately. The result of a search is a
 * record somebody is about to work from, so it wants an address that can be
 * reloaded, bookmarked and pasted to a colleague, the same rule every filtered
 * list here follows. On a phone it is also simply the better shape: a modal
 * over a 360px screen is a smaller screen.
 *
 * One exact hit does not render at all. It redirects, because a person holding
 * a bill and typing its number wants the bill, not a list with one thing on it.
 */

const KIND_LABEL: Record<SearchHitKind, string> = {
  bill: 'Bill',
  order: 'Order',
  party: 'Party',
  payment: 'Receipt',
  expense: 'Voucher',
  claim: 'Claim',
  advance: 'Advance',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const term = (q ?? '').trim();

  const hits = term.length >= 2 ? await searchRecords(term) : [];

  // Exactly one record answers to this number, so open it. Anything else is a
  // list of candidates to choose from.
  const exact = hits.filter((hit) => hit.exact);
  if (exact.length === 1 && exact[0]) redirect(exact[0].href);

  return (
    <>
      <PageTitle
        title="Search"
        subtitle={
          term
            ? `${hits.length} ${hits.length === 1 ? 'record' : 'records'} for "${term}"`
            : 'A bill number, an order reference, a party, a voucher or a receipt.'
        }
      />

      {term.length === 1 ? (
        <Notice tone="warning">
          Type at least two characters. One matches most of the book.
        </Notice>
      ) : null}

      {term.length >= 2 && hits.length === 0 ? (
        <Notice>
          Nothing matches {term}. A bill is found by the number written in the
          book or by the system number, a party by its name or code.
        </Notice>
      ) : null}

      {hits.length > 0 ? (
        <Card>
          <ul className="divide-y divide-[var(--color-line)]">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.href}-${hit.code}`}>
                <Link
                  href={hit.href}
                  className="flex min-h-14 items-center gap-3 px-3 py-3 hover:bg-[var(--color-canvas)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-[var(--color-navy)]">
                        {hit.code}
                      </span>
                      {hit.exact ? (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                          Exact
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-sm text-[var(--color-muted)]">
                      {hit.label}
                    </div>
                  </div>
                  <span className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                    {KIND_LABEL[hit.kind]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
