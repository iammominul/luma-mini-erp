import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money } from '@/lib/money';
import { formatTaka } from '@/lib/format';
import { Card, EmptyRow, PageTitle, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listPartyBalances } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

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
            <Link
              href={`/${side}/bills/new`}
              className="rounded bg-[var(--color-navy)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)]"
            >
              New {copy.billSingular}
            </Link>
            <Link
              href={`/${side}/settlements/new`}
              className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              New {copy.settlementSingular}
            </Link>
          </div>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{copy.partyWord}</Th>
              <Th numeric>Opening</Th>
              <Th numeric>Bills</Th>
              <Th numeric>Billed</Th>
              <Th numeric>{copy.settlementColumn}</Th>
              <Th numeric>{copy.balanceWord}</Th>
              <Th>Last Entry</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <EmptyRow columns={8}>
                No {copy.partyPlural.toLowerCase()} yet. Add one on the Parties
                page.
              </EmptyRow>
            ) : (
              balances.map((row) => (
                <tr key={row.party.id}>
                  <Td>
                    <Link
                      href={`/${side}/statement/${row.party.code ?? row.party.id}`}
                      className="font-medium text-[var(--color-navy)] hover:underline"
                    >
                      {row.party.name}
                    </Link>
                    {!row.party.active ? (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-[var(--color-muted)]">
                        Inactive
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric>{formatTaka(row.party.openingBalance)}</Td>
                  <Td numeric>{row.billCount}</Td>
                  <Td numeric>{formatTaka(row.billed)}</Td>
                  <Td numeric>{formatTaka(row.settled)}</Td>
                  <Td numeric className="font-semibold">
                    {formatTaka(row.balance)}
                  </Td>
                  <Td className="text-[var(--color-muted)]">
                    {formatDate(row.lastActivity)}
                  </Td>
                  <Td>
                    <Link
                      href={`/${side}/statement/${row.party.code ?? row.party.id}`}
                      className="text-sm text-[var(--color-navy)] hover:underline"
                    >
                      Statement
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {balances.length > 0 ? (
            <tfoot>
              <tr className="bg-[var(--color-canvas)] font-semibold">
                <Td>Total</Td>
                <Td numeric>{formatTaka(totals.opening)}</Td>
                <Td />
                <Td numeric>{formatTaka(totals.billed)}</Td>
                <Td numeric>{formatTaka(totals.settled)}</Td>
                <Td numeric>{formatTaka(totals.balance)}</Td>
                <Td />
                <Td />
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
