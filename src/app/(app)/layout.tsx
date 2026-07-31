import type { ReactNode } from 'react';
import { AppNav } from '@/components/AppNav';
import { Notice } from '@/components/ui';
import { company } from '@/lib/env';
import { checkReady } from '@/lib/ready';
import { signOutAction } from '../login/actions';

// Every page reads live figures, so nothing here is cached or pre-rendered.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const readiness = await checkReady();

  return (
    <div className="flex min-h-screen">
      <AppNav companyName={company().name} signOut={signOutAction} />
      <main className="min-w-0 flex-1 overflow-x-auto px-6 py-6">
        {readiness.ok ? (
          children
        ) : (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">Setup Needed</h1>
            <Notice tone="error">{readiness.message}</Notice>
            <p className="text-sm text-[var(--color-muted)]">
              The steps are listed in README.md.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
