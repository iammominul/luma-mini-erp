'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { SearchHit, SearchHitKind } from '@/lib/queries';

/**
 * The search box in the top bar, answering while somebody types.
 *
 * It is a real form around a real input, so it still works with JavaScript off
 * and Enter still lands on the Search screen with the term in the URL. What the
 * client adds is the part that makes it quick to work from: results under the
 * box after a short pause, arrow keys to walk them, Enter to open the one
 * highlighted, and Ctrl+K to get here from anywhere.
 *
 * The request is debounced and every earlier one is aborted, so typing a bill
 * number is one query that lands rather than six that race. Nothing is cached:
 * a register that changed a minute ago should say so.
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

/** Long enough that a pause reads as finished typing, short enough to feel live. */
const DEBOUNCE_MS = 180;

export function SearchBox({ className = '' }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const listId = useId();

  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  // On the Search screen the box holds what was asked for, so refining a term
  // means editing it rather than typing it out again.
  const [term, setTerm] = useState(
    pathname === '/search' ? (params.get('q') ?? '') : '',
  );
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);

  // Ctrl+K from anywhere. It is ignored while a modifier-free keystroke is
  // going into another field, so it can never take a character out of a bill
  // line, and Escape lets go of the box again.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // A click anywhere else puts the list away.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Navigating away closes it and clears what was typed, so the box is not
  // still offering yesterday's answer on the screen it took you to.
  useEffect(() => {
    setOpen(false);
    setActive(-1);
    if (pathname !== '/search') setTerm('');
  }, [pathname]);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      inFlight.current?.abort();
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { hits: SearchHit[] };
        setHits(body.hits);
        setActive(body.hits.length > 0 ? 0 : -1);
        setOpen(true);
      } catch (error) {
        // An abort is the expected end of a superseded request, not a fault.
        if ((error as Error)?.name !== 'AbortError') {
          setHits([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    input.current?.blur();
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else {
        input.current?.blur();
      }
      return;
    }
    if (!open || hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      const hit = hits[active];
      // Enter with nothing highlighted falls through to the form, which lands
      // on the Search screen with the whole list.
      if (hit) {
        event.preventDefault();
        go(hit);
      }
    }
  };

  const query = term.trim();

  return (
    <div ref={box} className={`relative ${className}`}>
      <form action="/search" role="search">
        <input
          ref={input}
          type="search"
          name="q"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Search a bill number, order, party or voucher"
          aria-label="Search records"
          className="min-h-11 w-full rounded border border-white/20 bg-white/10 px-3 py-2 pr-14 text-base text-white outline-none placeholder:text-white/50 focus:border-white/50 focus:bg-white/15 md:min-h-0 md:py-1.5 md:text-sm"
        />
        {/* The hint is desktop only: a phone has no Ctrl and no room for it. */}
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium text-white/50 md:block">
          Ctrl K
        </kbd>
      </form>

      {open && query.length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[var(--color-muted)]">
              {loading ? 'Searching' : `Nothing matches ${query}`}
            </p>
          ) : (
            <ul id={listId} role="listbox" className="max-h-96 overflow-y-auto">
              {hits.map((hit, index) => (
                <li key={`${hit.kind}-${hit.href}-${hit.code}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onClick={() => go(hit)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center gap-3 border-b border-[var(--color-line)] px-3 py-2.5 text-left last:border-b-0 ${
                      index === active ? 'bg-[var(--color-canvas)]' : 'bg-white'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--color-navy)]">
                        {hit.code}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">
                        {hit.label}
                      </span>
                    </span>
                    <span className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
                      {KIND_LABEL[hit.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            href={`/search?q=${encodeURIComponent(query)}`}
            className="block border-t border-[var(--color-line)] px-3 py-2.5 text-center text-sm font-medium text-[var(--color-navy)] hover:bg-[var(--color-canvas)]"
          >
            See all results
          </a>
        </div>
      ) : null}
    </div>
  );
}
