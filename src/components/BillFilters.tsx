'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NATURE_OF_WORK } from '@/lib/types';

/**
 * The filter bar over the bill register.
 *
 * Two things keep it from becoming a wall of controls. The search types
 * straight into the list, so there is no Apply button to look at. And only the
 * two filters used every day stay on the row: the rest sit behind More Filters,
 * which says how many are active so nothing is ever hidden without a trace.
 *
 * Every filter lives in the URL, so a filtered list can be bookmarked, sent to
 * someone, or reloaded without losing where you were.
 */

// Its own, because these controls size to their content rather than filling a
// field row. The touch height and the 16px text below md are the same reasoning
// as the shared CONTROL in ui.tsx: under 16px, iOS zooms the page on focus.
const CONTROL =
  'min-h-11 rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm';

export function BillFilters({
  partyWord,
  parties,
}: {
  partyWord: string;
  parties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [term, setTerm] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const typed = useRef(false);

  /** Rewrites one parameter and always returns to the first page. */
  const apply = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    router.replace(`${pathname}${next.size > 0 ? `?${next}` : ''}`, {
      scroll: false,
    });
  };

  // Typing waits a moment before it asks the server, so a five letter search is
  // one query rather than five. The guard keeps this from firing on first paint
  // and on a back navigation, which would fight the URL rather than follow it.
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (term) next.set('q', term);
      else next.delete('q');
      next.delete('page');
      router.replace(`${pathname}${next.size > 0 ? `?${next}` : ''}`, {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(timer);
    // params is deliberately absent: this reacts to typing, not to the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, pathname, router]);

  const status = params.get('status') ?? '';
  const party = params.get('party') ?? '';
  const work = params.get('work') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const tucked = [party, work, from, to].filter(Boolean).length;
  const anyFilter = tucked > 0 || Boolean(status) || Boolean(term);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={term}
          onChange={(event) => {
            typed.current = true;
            setTerm(event.target.value);
          }}
          placeholder={`Search bill number or ${partyWord.toLowerCase()}`}
          aria-label="Search bills"
          className={`w-full sm:w-64 ${CONTROL}`}
        />

        <select
          value={status}
          onChange={(event) => apply({ status: event.target.value })}
          aria-label="Status"
          className={`w-full sm:w-auto ${CONTROL}`}
        >
          <option value="">All Bills</option>
          <option value="draft">Drafts</option>
          <option value="posted">Posted</option>
          <option value="needs_detail">Needs Detail</option>
        </select>

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className={`w-full sm:w-auto ${CONTROL} font-medium hover:bg-gray-50`}
        >
          More Filters{tucked > 0 ? ` (${tucked})` : ''}
        </button>

        {anyFilter ? (
          <button
            type="button"
            onClick={() => {
              typed.current = true;
              setTerm('');
              router.replace(pathname, { scroll: false });
            }}
            className="inline-flex min-h-11 items-center px-1 text-sm text-[var(--color-navy)] hover:underline md:min-h-0"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-line)] pt-3">
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">{partyWord}</span>
            <select
              value={party}
              onChange={(event) => apply({ party: event.target.value })}
              className={`w-full sm:w-auto ${CONTROL}`}
            >
              <option value="">All</option>
              {parties.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">
              Nature of Work
            </span>
            <select
              value={work}
              onChange={(event) => apply({ work: event.target.value })}
              className={`w-full sm:w-auto ${CONTROL}`}
            >
              <option value="">All</option>
              {NATURE_OF_WORK.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => apply({ from: event.target.value })}
              className={`w-full sm:w-auto ${CONTROL}`}
            />
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => apply({ to: event.target.value })}
              className={`w-full sm:w-auto ${CONTROL}`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
