import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageTitle } from '@/components/ui';
import { roleLabel } from '@/lib/permissions';
import { getUser, otherActiveOwners } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { ManageUser } from './ManageUser';

/**
 * Everything about one account, in one place: name and email, role, password,
 * and whether it is enabled.
 *
 * The URL carries the row id rather than a business key, which rule 10 normally
 * asks against. A user has no code, and the thing that identifies them is their
 * email, which has no business in a URL or in a server log. That is the same
 * carve-out rule 10 already makes for a bill received.
 */
export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requirePermission('user:manage');
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();

  // The last active Owner cannot be demoted or disabled, or nobody could manage
  // users at all. The server refuses it too; this is so the screen says why
  // rather than offering a control that would be turned down.
  const lastActiveOwner =
    user.role === 'owner' &&
    user.status === 'active' &&
    (await otherActiveOwners(user.id)) === 0;

  return (
    <>
      <PageTitle
        title={`Manage User: ${user.name}`}
        subtitle={`${roleLabel(user.role)}. Added ${user.createdAt}. Last signed in ${
          user.lastSignedInAt ?? 'never'
        }.`}
        action={
          <Link href="/users" className="text-sm underline">
            Back to Users
          </Link>
        }
      />

      <ManageUser
        user={user}
        isSelf={user.id === me.id}
        lastActiveOwner={lastActiveOwner}
      />

      {lastActiveOwner ? (
        <Card className="mt-4 max-w-lg p-4 text-sm text-[var(--color-muted)]">
          This is the last active Owner. The role and the status are locked,
          because changing either would leave nobody able to add a user or
          approve a payroll run. Make somebody else an Owner first.
        </Card>
      ) : null}
    </>
  );
}
