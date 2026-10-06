import Link from 'next/link';
import { formatTaka } from '@/lib/format';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, CardHeader, LinkButton, PageTitle } from '@/components/ui';
import { listParties } from '@/lib/queries';
import { rolesLabel } from '@/lib/types';
import { togglePartyActiveAction } from './actions';

type Party = Awaited<ReturnType<typeof listParties>>[number];

const columns: Column<Party>[] = [
  {
    key: 'code',
    head: 'Code',
    headClassName: 'w-24',
    cellClassName: 'text-[var(--color-muted)]',
    phone: 'meta',
    cell: (party) => party.code ?? '',
  },
  {
    key: 'name',
    head: 'Name',
    phone: 'title',
    cell: (party) => (
      <Link
        href={`/parties/${party.code ?? party.id}`}
        className="font-medium text-[var(--color-navy)] hover:underline"
      >
        {party.name}
      </Link>
    ),
  },
  {
    key: 'roles',
    head: 'Roles',
    cell: (party) => rolesLabel(party.roles),
  },
  {
    key: 'contact',
    head: 'Contact',
    cell: (party) => party.contactPerson ?? '',
  },
  {
    key: 'phone',
    head: 'Phone',
    cell: (party) => party.phone ?? '',
  },
  {
    key: 'openingBalance',
    head: 'Opening Balance',
    numeric: true,
    cell: (party) => formatTaka(party.openingBalance),
  },
  {
    key: 'status',
    head: 'Status',
    cell: (party) => (
      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
          party.active
            ? 'bg-green-50 text-green-700'
            : 'bg-gray-100 text-[var(--color-muted)]'
        }`}
      >
        {party.active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
  {
    key: 'actions',
    head: '',
    phone: 'full',
    cell: (party) => (
      <div className="flex items-center gap-3">
        {/* Named, not just the party's own name higher up the row. Editing was
            reachable only by knowing the name was a link, which is not a way
            anybody finds out. */}
        <Link
          href={`/parties/${party.code ?? party.id}`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Edit
        </Link>
        <Link
          href={`/${party.roles.customer ? 'customers' : party.roles.subcontractor ? 'subcontractors' : 'suppliers'}/statement/${party.code ?? party.id}`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Statement
        </Link>
        {/* Its own form, so the copy in the other layout posts only itself. */}
        <form action={togglePartyActiveAction}>
          <input type="hidden" name="id" value={party.id} />
          <input type="hidden" name="active" value={String(!party.active)} />
          <button className="text-sm text-[var(--color-muted)] hover:underline">
            {party.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </form>
      </div>
    ),
  },
];

export default async function PartiesPage() {
  const parties = await listParties({ includeInactive: true });

  return (
    <>
      <PageTitle
        title="Parties"
        action={
          <LinkButton href="/parties/new" icon="plus">
            Add Party
          </LinkButton>
        }
      />

      <Card>
        <CardHeader title={`All Parties (${parties.length})`} />
        <DataTable
          columns={columns}
          rows={parties}
          rowKey={(party) => party.id}
          empty="No parties yet"
        />
      </Card>
    </>
  );
}
