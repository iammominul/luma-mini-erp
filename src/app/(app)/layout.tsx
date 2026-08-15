import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/ui';
import { company } from '@/lib/env';
import { can } from '@/lib/permissions';
import { recentActivity } from '@/lib/queries';
import { checkReady } from '@/lib/ready';
import { requireUser } from '@/lib/session';
import { signOutAction } from '../login/actions';

// Every page reads live figures, so nothing here is cached or pre-rendered.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Readiness is checked first, and deliberately before the session. Reading a
  // session is a query, so on a deployment whose tables are not created yet it
  // would fail with a stack trace and hide the two setup steps that are the
  // whole point of this check. Nothing is leaked by that order: the message
  // says only that the database is not set up, and a deployment in that state
  // has no accounts to protect.
  const readiness = await checkReady();
  if (!readiness.ok) return <SetupNeeded message={readiness.message} />;

  // Every screen in this group is behind a live session. The proxy only saw a
  // cookie; this is the check that reads it, and it runs once for the whole
  // group rather than being repeated on each page.
  const user = await requireUser();

  // The peek in the top bar, and only for a role that may read the log. It is
  // five rows off an index, so it costs about nothing to fetch on every page,
  // and fetching it here is what keeps it on screen everywhere rather than on
  // the dashboard alone.
  const recent = can(user.role, 'activity:read')
    ? await recentActivity(5)
    : null;

  // The shell is a client component because the drawer has state. `children`
  // goes through it as a slot, so every page inside stays a server component.
  return (
    <AppShell
      companyName={company().name}
      signOut={signOutAction}
      userName={user.name}
      userEmail={user.email}
      role={user.role}
      recent={recent}
    >
      {children}
    </AppShell>
  );
}

function SetupNeeded({ message }: { message: string }) {
  return (
    <main className="min-h-screen space-y-3 px-4 py-4 md:px-6 md:py-6">
      <h1 className="text-lg font-semibold">Setup Needed</h1>
      <Notice tone="error">{message}</Notice>
      <p className="text-sm text-[var(--color-muted)]">
        The steps are listed in README.md.
      </p>
    </main>
  );
}
