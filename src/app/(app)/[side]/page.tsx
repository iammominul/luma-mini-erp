import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money } from '@/lib/money';
import { formatTaka } from '@/lib/format';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, LinkButton, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listPartyBalances } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

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
        <>
          <Link
            href={`/${side}/statement/${row.party.code ?? row.party.id}`}
            className="font-medium link"
          >
            {row.party.name}
          </Link>
          {!row.party.active ? (
            <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-ink-3">
              Inactive
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'opening',
      head: 'Opening',
      numeric: true,
      cell: (row) => formatTaka(row.party.openingBalance),
    },
    {
      key: 'billCount',
      head: 'Bills',
      numeric: true,
      cell: (row) => row.billCount,
    },
    {
      key: 'billed',
      head: 'Billed',
      numeric: true,
      cell: (row) => formatTaka(row.billed),
    },
    {
      key: 'settled',
      head: copy.settlementColumn,
      numeric: true,
      cell: (row) => formatTaka(row.settled),
    },
    {
      // The figure the screen exists to answer, so on a phone it gets its own
      // line at the foot of the block rather than sharing one with a subtotal.
      key: 'balance',
      head: copy.balanceWord,
      numeric: true,
      cellClassName: 'font-semibold',
      phone: 'full',
      phoneClassName:
        'border-t border-rule pt-2 text-title font-semibold',
      cell: (row) => formatTaka(row.balance),
    },
    {
      key: 'lastActivity',
      head: 'Last Entry',
      cellClassName: 'text-ink-3',
      phone: 'meta',
      cell: (row) => formatDate(row.lastActivity),
    },
    {
      // The name at the top of the block is the same link, so a second one
      // would only be repeating itself.
      key: 'statement',
      head: '',
      phone: 'off',
      cell: (row) => (
        <Link
          href={`/${side}/statement/${row.party.code ?? row.party.id}`}
          className="text-sm link"
        >
          Statement
        </Link>
      ),
    },
  ];
}

export default async function SideOutstandingPage({
  params,
}: {
  params: Promise<{ side: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const balances = await listPartyBalances(copy.role);

  const totals = balances.reduce(
    (sum, row) => ({
      opening: sum.opening.add(row.party.openingBalance),
      billed: sum.billed.add(row.billed),
      settled: sum.settled.add(row.settled),
      balance: sum.balance.add(row.balance),
    }),
    {
      opening: Money.ZERO,
      billed: Money.ZERO,
      settled: Money.ZERO,
      balance: Money.ZERO,
    },
  );

  return (
    <>
      <PageTitle
        title={`${copy.partyPlural} ${copy.outstandingWord}`}
        subtitle={`Opening balance plus bills less ${copy.settlementTitle.toLowerCase()}, per ${copy.partyWord.toLowerCase()}.`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/${side}/bills/new`} icon="plus">
              New {copy.billSingular}
            </LinkButton>
            <LinkButton
              href={`/${side}/settlements/new`}
              variant="secondary"
              icon="plus"
            >
              New {copy.settlementSingular}
            </LinkButton>
          </div>
        }
      />

      <Card>
        <DataTable
          columns={columnsFor(side, copy)}
          rows={balances}
          rowKey={(row) => row.party.id}
          empty={`No ${copy.partyPlural.toLowerCase()} yet. Add one on the Parties page.`}
          total={{
            label: 'Total',
            cells: {
              opening: formatTaka(totals.opening),
              billed: formatTaka(totals.billed),
              settled: formatTaka(totals.settled),
              balance: formatTaka(totals.balance),
            },
          }}
        />
      </Card>
    </>
  );
}
