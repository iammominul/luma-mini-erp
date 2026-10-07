'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ActivityEntry } from '@/lib/types';

/**
 * The last few things that changed, from the top bar.
 *
 * Deliberately not a notification system. There is no unread count, no read
 * receipt and no per-user state, because none of that exists in the book: this
 * is a peek at the newest rows of the append only activity log, and the log is
 * the same for everybody looking at it. The full ERP's own direction puts it
 * the same way, that nothing here is a notification, every line is a record.
 *
 * It answers one question, "what has changed since I last looked", and hands
 * off to the Audit Trail for anything more than that.
 */
export function RecentChanges({ entries }: { entries: ActivityEntry[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label="Recent changes"
        title="Recent changes"
        className="inline-flex h-11 w-11 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white md:h-9 md:w-9"
      >
        <Icon name="recent" className="h-5 w-5" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded border border-rule bg-white text-ink shadow-lg">
          <div className="border-b border-rule px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
            Recent Changes
          </div>
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-ink-3">
              Nothing recorded yet
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.id} className="px-3 py-2">
                  <div className="text-sm">{entry.summary}</div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    <span className="capitalize">{entry.action}</span>
                    {' by '}
                    {entry.actorName ?? 'Not recorded'}
                    {', '}
                    {entry.at}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/audit"
            onClick={() => setOpen(false)}
            className="block border-t border-rule px-3 py-2.5 text-center text-sm font-medium text-navy hover:bg-surface-2"
          >
            View Audit Trail
          </Link>
        </div>
      ) : null}
    </div>
  );
}
