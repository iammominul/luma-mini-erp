import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  Card,
  LinkButton,
  Notice,
  PageTitle,
  Tag,
} from '@/components/ui';
import { listUsers } from '@/lib/queries';
import { roleDescription, roleLabel, ROLES } from '@/lib/permissions';
import { requirePermission } from '@/lib/session';

type User = Awaited<ReturnType<typeof listUsers>>[number];

function columnsFor(meId: string): Column<User>[] {
  return [
    {
      key: 'name',
      head: 'Name',
      cellClassName: 'font-medium',
      phone: 'title',
      cell: (user) => (
        <>
          <Link href={`/users/${user.id}`} className="underline">
            {user.name}
          </Link>
          {user.id === meId ? (
            <span className="ml-2 text-xs text-ink-3">You</span>
          ) : null}
        </>
      ),
    },
    {
      key: 'email',
      head: 'Email',
      phone: 'meta',
      cell: (user) => user.email,
    },
    {
      key: 'role',
      head: 'Role',
      cell: (user) => roleLabel(user.role),
    },
    {
      key: 'status',
      head: 'Status',
      cell: (user) =>
        user.status === 'disabled' ? (
          <Tag tone="crit">Disabled</Tag>
        ) : (
          <Tag>Active</Tag>
        ),
    },
    {
      key: 'lastSignedIn',
      head: 'Last Signed In',
      cellClassName: 'whitespace-nowrap',
      cell: (user) => (
        <>
          {user.lastSignedInAt ?? (
            <span className="text-ink-3">Never</span>
          )}
          {user.hasLiveSession ? (
            <span className="block text-xs text-ink-3">
              Signed in now
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'added',
      head: 'Added',
      cellClassName: 'whitespace-nowrap',
      cell: (user) => user.createdAt,
    },
    {
      key: 'actions',
      head: '',
      cellClassName: 'whitespace-nowrap',
      phone: 'full',
      cell: (user) => (
        <Link href={`/users/${user.id}`} className="underline">
          Manage
        </Link>
      ),
    },
  ];
}

/**
 * Who can sign in. The list reads and does not write: every change to an
 * account is made on its own Manage page, behind an explicit button. The role
 * used to be a dropdown in the row that saved the moment it changed, which put
 * granting somebody Owner one stray click away.
 */
export default async function UsersPage() {
  // An Owner only. A role that cannot manage users gets a 404, not a redirect.
  const me = await requirePermission('user:manage');
  const users = await listUsers();

  const activeOwners = users.filter(
    (user) => user.role === 'owner' && user.status === 'active',
  ).length;

  return (
    <>
      <PageTitle
        title="Users"
        action={
          <LinkButton href="/users/new" icon="plus">
            New User
          </LinkButton>
        }
      />

      {activeOwners === 1 ? (
        <Notice tone="warning" className="mb-4">
          There is one active Owner. If that account is lost, nobody can add a
          user or approve a payroll run. Consider making a second person an
          Owner.
        </Notice>
      ) : null}

      <Card className="mb-4">
        <DataTable
          columns={columnsFor(me.id)}
          rows={users}
          rowKey={(user) => user.id}
          rowClassName={(user) =>
            user.status === 'disabled'
              ? 'bg-surface-2 text-ink-3'
              : ''
          }
          empty="No users yet."
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">What Each Role Can Do</h2>
        <dl className="space-y-1.5 text-sm">
          {ROLES.map((role) => (
            <div key={role} className="flex gap-2">
              <dt className="w-24 shrink-0 font-medium">{roleLabel(role)}</dt>
              <dd className="text-ink-3">
                {roleDescription(role)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-3">
          A role is checked on the server for every action, not only hidden from
          the menu.
        </p>
      </Card>
    </>
  );
}
