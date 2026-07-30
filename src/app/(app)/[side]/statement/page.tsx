import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { Card, EmptyRow, PageTitle, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listPartyBalances } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

export default async function StatementIndexPage({
  params,
}: {
  params: Promise<{ side: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const balances = await listPartyBalances(side);

  return (
    <>
      <PageTitle
        title="Statements"
        subtitle={`Open a ${copy.partyWord.toLowerCase()} to print a statement of account for any period.`}
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{copy.partyWord}</Th>
              <Th>Contact</Th>
              <Th>Last Entry</Th>
              <Th numeric>{copy.balanceWord}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <EmptyRow columns={5}>
                No {copy.partyPlural.toLowerCase()} yet
              </EmptyRow>
            ) : (
              balances.map((row) => (
                <tr key={row.party.id}>
                  <Td>
                    <Link
                      href={`/${side}/statement/${row.party.id}`}
                      className="font-medium text-[var(--color-navy)] hover:underline"
                    >
                      {row.party.name}
                    </Link>
                  </Td>
                  <Td className="text-[var(--color-muted)]">
                    {[row.party.contactPerson, row.party.phone]
                      .filter(Boolean)
                      .join(', ')}
                  </Td>
                  <Td className="text-[var(--color-muted)]">
                    {formatDate(row.lastActivity)}
                  </Td>
                  <Td numeric>{formatTaka(row.balance)}</Td>
                  <Td>
                    <Link
                      href={`/${side}/statement/${row.party.id}`}
                      className="text-sm text-[var(--color-navy)] hover:underline"
                    >
                      Open Statement
                    </Link>
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
