import Link from 'next/link';
import {
  Card,
  EmptyRow,
  LinkButton,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { listLoans } from '@/lib/queries';
import { requirePermission } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Every loan and what is still owed on it.
 *
 * This is the outstanding report as well as the list. A second screen showing
 * the same figure under a second name is the one thing the rail must never do.
 *
 * Nothing here is stored: the outstanding is what was received less what has
 * been repaid, worked out every time it is read.
 */
export default async function LoansPage() {
  await requirePermission('fund:read');
  const loans = await listLoans();

  const outstanding = sumMoney(loans.map((loan) => loan.outstanding));
  const interest = sumMoney(loans.map((loan) => loan.interestPaid));
  const running = loans.filter((loan) => loan.active).length;

  return (
    <>
      <PageTitle
        title="Loans"
        action={
          <LinkButton href="/loans/new" icon="plus">
            New Loan
          </LinkButton>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Outstanding" value={formatTaka(outstanding)} />
        <StatTile
          label="Interest Paid"
          value={formatTaka(interest)}
          note="A cost. The principal is not."
        />
        <StatTile
          label="Running"
          value={String(running)}
          note={`${loans.length} in total`}
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Lender</Th>
              <Th>Taken On</Th>
              <Th numeric>Received</Th>
              <Th numeric>Repaid</Th>
              <Th numeric>Interest</Th>
              <Th numeric>Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <EmptyRow columns={7}>
                No loans recorded.{' '}
                <Link href="/loans/new" className="underline">
                  Record one
                </Link>
                .
              </EmptyRow>
            ) : (
              loans.map((loan) => (
                <tr key={loan.id}>
                  <Td className="whitespace-nowrap font-medium">
                    <Link
                      href={`/loans/${loan.code ?? loan.id}`}
                      className="underline"
                    >
                      {loan.code ?? 'Open'}
                    </Link>
                  </Td>
                  <Td>
                    {loan.lender}
                    {loan.active ? null : (
                      <span className="ml-2 text-xs text-[var(--color-muted)]">
                        Settled
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(loan.takenOn)}
                  </Td>
                  <Td numeric>{formatTaka(loan.received)}</Td>
                  <Td numeric>{formatTaka(loan.repaid)}</Td>
                  <Td numeric>{formatTaka(loan.interestPaid)}</Td>
                  <Td numeric>{formatTaka(loan.outstanding)}</Td>
                </tr>
              ))
            )}
            {loans.length > 0 ? (
              <tr className="font-semibold">
                <Td colSpan={3}>Total</Td>
                <Td numeric>
                  {formatTaka(sumMoney(loans.map((l) => l.received)))}
                </Td>
                <Td numeric>
                  {formatTaka(sumMoney(loans.map((l) => l.repaid)))}
                </Td>
                <Td numeric>{formatTaka(interest)}</Td>
                <Td numeric>{formatTaka(outstanding)}</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
