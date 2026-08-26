import { notFound, permanentRedirect } from 'next/navigation';
import { MoneyEntryForm } from '@/components/MoneyEntryForm';
import {
  Card,
  CardHeader,
  EmptyRow,
  Field,
  LinkButton,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
  TextInput,
} from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { buildLoanLedger } from '@/lib/loan';
import { findLoan, listLoanMovements } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { fundCategoryLabel, paymentModeLabel } from '@/lib/types';
import { recordDrawdownAction, recordRepaymentAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * One loan, its ledger, and the two things anybody does to it.
 *
 * Both actions are on this page rather than behind a route of their own,
 * because recording an installment is four fields and reading the outstanding
 * beside it is the point of opening the screen at all.
 */
export default async function LoanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requirePermission('fund:read');
  const { code } = await params;
  const loan = await findLoan(code);
  if (!loan) notFound();

  if (isUuid(code) && loan.code) {
    permanentRedirect(`/loans/${loan.code}`);
  }

  const movements = await listLoanMovements(loan.id);
  const ledger = buildLoanLedger({ movements });
  const today = todayInDhaka();
  const key = loan.code ?? loan.id;

  return (
    <>
      <PageTitle
        title={loan.lender}
        subtitle={[loan.code, loan.reference, loan.active ? null : 'Settled']
          .filter(Boolean)
          .join(' | ')}
        action={
          <LinkButton href={`/loans/${key}/edit`} variant="secondary">
            Edit Loan
          </LinkButton>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Received" value={formatTaka(ledger.totalIn)} />
        <StatTile
          label="Principal Repaid"
          value={formatTaka(ledger.totalOut)}
        />
        <StatTile
          label="Interest Paid"
          value={formatTaka(ledger.totalInterest)}
          note="Outside the balance"
        />
        <StatTile label="Outstanding" value={formatTaka(ledger.closing)} />
      </div>

      {loan.terms ? (
        <Card className="mb-4 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
            Interest and Terms
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{loan.terms}</p>
        </Card>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Record Repayment" />
          <div className="p-4 pt-3">
            <MoneyEntryForm
              action={recordRepaymentAction}
              submitLabel="Save Repayment"
              today={today}
              amountLabel="Principal (Tk)"
              extra={
                <>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <input type="hidden" name="code" value={key} />
                  <Field
                    label="Interest and Charges (Tk)"
                    hint="A cost. The principal is not."
                  >
                    <TextInput
                      name="interestAmount"
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Reference">
                    <TextInput
                      type="text"
                      name="reference"
                      maxLength={80}
                      autoComplete="off"
                    />
                  </Field>
                </>
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Record Further Drawing" />
          <div className="p-4 pt-3">
            <MoneyEntryForm
              action={recordDrawdownAction}
              submitLabel="Save Drawing"
              today={today}
              extra={
                <>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <input type="hidden" name="code" value={key} />
                  <Field label="Reference">
                    <TextInput
                      type="text"
                      name="reference"
                      maxLength={80}
                      autoComplete="off"
                    />
                  </Field>
                </>
              }
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Ledger" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Voucher</Th>
              <Th>Entry</Th>
              <Th>Method</Th>
              <Th numeric>Received</Th>
              <Th numeric>Repaid</Th>
              <Th numeric>Interest</Th>
              <Th numeric>Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.length === 0 ? (
              <EmptyRow columns={8}>Nothing recorded yet</EmptyRow>
            ) : (
              ledger.rows.map((row) => (
                <tr key={row.movement.id}>
                  <Td className="whitespace-nowrap">
                    {formatDate(row.movement.movedOn)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.movement.docNo ?? ''}
                  </Td>
                  <Td>{fundCategoryLabel(row.movement.category)}</Td>
                  <Td className="whitespace-nowrap text-[var(--color-muted)]">
                    {paymentModeLabel(row.movement.mode)}
                  </Td>
                  <Td numeric>{row.moneyIn ? formatTaka(row.moneyIn) : ''}</Td>
                  <Td numeric>
                    {row.moneyOut ? formatTaka(row.moneyOut) : ''}
                  </Td>
                  <Td numeric>
                    {row.interest ? formatTaka(row.interest) : ''}
                  </Td>
                  <Td numeric>{formatTaka(row.balance)}</Td>
                </tr>
              ))
            )}
            {ledger.rows.length > 0 ? (
              <tr className="font-semibold">
                <Td colSpan={4}>Outstanding</Td>
                <Td numeric>{formatTaka(ledger.totalIn)}</Td>
                <Td numeric>{formatTaka(ledger.totalOut)}</Td>
                <Td numeric>{formatTaka(ledger.totalInterest)}</Td>
                <Td numeric>{formatTaka(ledger.closing)}</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      {loan.notes ? (
        <Card className="mt-4 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
            Note
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{loan.notes}</p>
        </Card>
      ) : null}
    </>
  );
}
