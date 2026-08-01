import Link from 'next/link';

/**
 * What a wrong address answers with. A mistyped bill number, a party removed
 * since the link was sent, an old bookmark: all ordinary events, so this states
 * the fact and offers the way back rather than apologizing.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-lg font-semibold">Page Not Found</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        There is nothing at this address. The record may have been removed, or
        the number in the link may be wrong. Check the number against the
        register before entering it again.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/"
          className="rounded bg-[var(--color-navy)] px-3 py-1.5 font-medium text-white hover:bg-[var(--color-navy-600)]"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/customers/bills"
          className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 font-medium hover:bg-gray-50"
        >
          Customer Bills
        </Link>
        <Link
          href="/parties"
          className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 font-medium hover:bg-gray-50"
        >
          Parties
        </Link>
      </div>
    </main>
  );
}
