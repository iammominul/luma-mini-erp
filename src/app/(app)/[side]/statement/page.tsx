import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listPartyBalances } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { formatBalance } from '@/lib/statement';

type Balance = Awaited<ReturnType<typeof listPartyBalances>>[number];

function columnsFor(
  side: string,
  copy: ReturnType<typeof copyFor>,
): Column<Balance>[] {
  return [
    {
      key: 'party',
      head: copy.partyWord,
      phone: 'title',
      cell: (row) => (
        <Link
          href={`/${side}/statement/${row.party.code ?? row.party.id}`}
          className="font-medium text-[var(--color-navy)] hover:underline"
        >
          {row.party.name}
        </Link>
      ),
    },
    {
      key: 'contact',
      head: 'Contact',
      cellClassName: 'text-[var(--color-muted)]',
      phone: 'meta',
      cell: (row) =>
        [row.party.contactPerson, row.party.phone].filter(Boolean).join(', '),
    },
    {
      key: 'lastActivity',
      head: 'Last Entry',
      cellClassName: 'text-[var(--color-muted)]',
      cell: (row) => formatDate(row.lastActivity),
    },
    {
      key: 'balance',
      head: copy.balanceWord,
      numeric: true,
      cell: (row) => formatBalance(row.balance),
    },
    {
      // The name at the top of the block already opens the ledger.
      key: 'open',
      head: '',
      phone: 'off',
      cell: (row) => (
        <Link
          href={`/${side}/statement/${row.party.code ?? row.party.id}`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Open Ledger
        </Link>
      ),
    },
  ];
}

export default async function StatementIndexPage({
  params,
}: {
  params: Promise<{ side: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const balances = await listPartyBalances(copy.role);

  return (
    <>
      <PageTitle
        title="Party Ledger"
        subtitle={`Open a ${copy.partyWord.toLowerCase()} for its running ledger, and download the Party Ledger for any period.`}
      />

      <Card>
        <DataTable
          columns={columnsFor(side, copy)}
          rows={balances}
          rowKey={(row) => row.party.id}
          empty={`No ${copy.partyPlural.toLowerCase()} yet`}
        />
      </Card>
    </>
  );
}
