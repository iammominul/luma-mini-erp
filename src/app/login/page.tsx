import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Notice } from '@/components/ui';
import { company } from '@/lib/env';
import { checkReady } from '@/lib/ready';
import { currentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

// Every other screen is titled Interim Billing by the root layout. This one is
// the door, so the tab says which door it is.
export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage() {
  // Signing in is a query, so on a deployment whose tables are not created yet
  // the form would only ever fail. Say what is missing instead of offering it.
  const readiness = await checkReady();

  // Somebody already signed in has no use for this page. The check is made here
  // rather than in src/proxy.ts because it reads the database: a cookie whose
  // session has since been dropped gets the form, which is what it needs, and
  // not a redirect back to a page that would only return it here.
  if (readiness.ok && (await currentUser())) redirect('/');

  const { name, address } = company();

  return (
    // One column, centered, at every width. This screen was two columns with
    // the company on a navy panel down the left, which is the shape a product
    // uses to sell itself to a visitor who has not signed up yet. Nobody
    // reaches this door without an account already made for them by an Owner,
    // so the panel was a pitch to an audience of one office. Below md it also
    // became a band across the top, and every line in it pushed the form
    // further down a phone screen.
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <BrandBlock name={name} />

        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Sign In</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Enter your email address and password.
          </p>

          <div className="mt-4">
            {readiness.ok ? (
              <LoginForm />
            ) : (
              <div className="space-y-3">
                <Notice tone="error">{readiness.message}</Notice>
                <p className="text-sm text-[var(--color-muted)]">
                  The steps are listed in README.md.
                </p>
              </div>
            )}
          </div>
        </Card>

        {address ? (
          <p className="mt-5 text-center text-xs leading-relaxed text-[var(--color-ink-3)]">
            {address}
          </p>
        ) : null}
      </div>
    </main>
  );
}

/**
 * The company, above the card.
 *
 * The mark is `public/brand-mark.svg`, the same file and the same treatment the
 * top bar uses: a plain img rather than an inline SVG, because it is a brand
 * asset somebody replaces on disk and a file swapped there should not need a
 * component edited. It is drawn white, so it is set on a navy tile here rather
 * than on the page, which is how this screen and the bar share one file instead
 * of needing a second copy in another color.
 *
 * The name is COMPANY_NAME, set as type. It is never in the file.
 */
function BrandBlock({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded bg-[var(--color-navy)]">
        <img
          src="/brand-mark.svg"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8"
        />
      </span>
      <h1 className="mt-3 max-w-full truncate text-base font-semibold tracking-wide">
        {name}
      </h1>
      <p className="text-[9.5px] uppercase leading-tight tracking-[0.12em] text-[var(--color-ink-3)]">
        Interim Billing
      </p>
    </div>
  );
}
