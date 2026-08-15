import { redirect } from 'next/navigation';
import { Notice } from '@/components/ui';
import { company } from '@/lib/env';
import { checkReady } from '@/lib/ready';
import { currentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Signing in is a query, so on a deployment whose tables are not created yet
  // the form would only ever fail. Say what is missing instead of offering it.
  const readiness = await checkReady();

  // Somebody already signed in has no use for this page. The check is made here
  // rather than in src/proxy.ts because it reads the database: a cookie whose
  // session has since been dropped gets the form, which is what it needs, and
  // not a redirect back to a page that would only return it here.
  if (readiness.ok && (await currentUser())) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">{company().name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Interim Billing
          </p>
        </div>
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
    </div>
  );
}
