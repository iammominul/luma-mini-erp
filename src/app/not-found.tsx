import { LinkButton } from '@/components/ui';

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
      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton href="/">Go to Dashboard</LinkButton>
        <LinkButton href="/customers/bills" variant="secondary">
          Customer Bills
        </LinkButton>
        <LinkButton href="/parties" variant="secondary">
          Parties
        </LinkButton>
      </div>
    </main>
  );
}
