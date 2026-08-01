import Link from 'next/link';
import { Money } from '@/lib/money';
import { formatTaka } from '@/lib/format';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listPartyBalances, recentActivity } from '@/lib/queries';
import { copyFor, type Side } from '@/lib/side';
import type { PartyBalance } from '@/lib/types';

function outstanding(balances: PartyBalance[]): PartyBalance[] {
  return balances
    .filter((row) => !row.balance.isZero())
    .sort((a, b) => b.balance.compare(a.balance));
}

function total(balances: PartyBalance[]): Money {
  return balances.reduce((sum, row) => sum.add(row.balance), Money.ZERO);
}

function OutstandingCard({
  side,
  balances,
}: {
  side: Side;
  balances: PartyBalance[];
}) {
  const copy = copyFor(side);
  const rows = outstanding(balances).slice(0, 8);

  return (
    <Card>
      <CardHeader
        title={`${copy.partyPlural} ${copy.outstandingWord}`}
        action={
          <Link
            href={`/${side}`}
            className="text-sm text-[var(--color-navy)] hover:underline"
          >
            View All
          </Link>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>{copy.partyWord}</Th>
            <Th>Last Entry</Th>
            <Th numeric>{copy.balanceWord}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow columns={3}>Nothing outstanding</EmptyRow>
          ) : (
            rows.map((row) => (
              <tr key={row.party.id}>
                <Td>
                  <Link
                    href={`/${side}/statement/${row.party.code ?? row.party.id}`}
                    className="text-[var(--color-navy)] hover:underline"
                  >
                    {row.party.name}
                  </Link>
                </Td>
                <Td className="text-[var(--color-muted)]">
                  {formatDate(row.lastActivity) || 'No entries'}
                </Td>
                <Td numeric>{formatTaka(row.balance)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

export default async function DashboardPage() {
  const [customers, subcontractors, activity] = await Promise.all([
    listPartyBalances('customer'),
    listPartyBalances('subcontractor'),
    recentActivity(10),
  ]);

  const receivable = total(customers);
  const payable = total(subcontractors);

  return (
    <>
      <PageTitle
        title="Dashboard"
        subtitle="Outstanding on both sides, computed from the bills and receipts entered."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Receivable from Customers"
          value={formatTaka(receivable)}
          note={`${outstanding(customers).length} of ${customers.length} customers`}
        />
        <StatTile
          label="Payable to Subcontractors"
          value={formatTaka(payable)}
          note={`${outstanding(subcontractors).length} of ${subcontractors.length} subcontractors`}
        />
        <StatTile
          label="Net Position"
          value={formatTaka(receivable.subtract(payable))}
          note="Receivable less payable"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OutstandingCard side="customers" balances={customers} />
        <OutstandingCard side="subcontractors" balances={subcontractors} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent Entries" />
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Entry</Th>
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 ? (
              <EmptyRow columns={3}>No entries yet</EmptyRow>
            ) : (
              activity.map((entry) => (
                <tr key={entry.id}>
                  <Td className="whitespace-nowrap text-[var(--color-muted)]">
                    {entry.at}
                  </Td>
                  <Td className="capitalize">{entry.action}</Td>
                  <Td>
                    {entry.summary}
                    {entry.reason ? (
                      <span className="block text-xs text-[var(--color-muted)]">
                        Reason: {entry.reason}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
