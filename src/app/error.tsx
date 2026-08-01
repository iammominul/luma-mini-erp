'use client';

import Link from 'next/link';

/**
 * What a failed request answers with.
 *
 * The digest is the one thing worth showing: it is the handle the same failure
 * carries in the server log, so a report of "it broke" can be tied to the actual
 * error without the reader being shown a stack trace. Nothing else about the
 * fault is exposed, because nothing else is any use to the person reading it.
 *
 * No figure is ever half-saved behind this page. Every write in this app is one
 * transaction, so an entry either went in whole or did not go in at all.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-lg font-semibold">Something Went Wrong</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        The page could not be shown. Nothing has been part saved: an entry is
        either recorded in full or not at all. Try again, and if it keeps
        happening, quote the reference below.
      </p>
      {error.digest ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">Reference: </span>
          <code className="rounded bg-[var(--color-canvas)] px-1.5 py-0.5">
            {error.digest}
          </code>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-[var(--color-navy)] px-3 py-1.5 font-medium text-white hover:bg-[var(--color-navy-600)]"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 font-medium hover:bg-gray-50"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
