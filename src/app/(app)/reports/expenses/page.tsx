import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { marginPercent } from '@/lib/costing';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { profitFigures } from '@/lib/queries';
import {
  COST_TIERS,
  type CostTier,
  expenseCategoryLabel,
  expenseCategoryTier,
  natureOfWorkLabel,
} from '@/lib/types';
import { RangePicker, rangeLabel, readRange } from '../range';

export const dynamic = 'force-dynamic';

/**
 * Every cost in a range, grouped by the tier its category carries.
 *
 * This is the register behind the profit statement: the same figures, listed
 * rather than subtracted, so a total on the statement can be traced to the
 * categories it came from.
 */
export default async function ExpenseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = readRange(await searchParams);
  const figures = await profitFigures(range.from, range.to);

  const rows = [
    ...figures.subcontract.map((row) => ({
      label: natureOfWorkLabel(row.natureOfWork),
      note: 'Subcontractor bills',
      amount: row.amount,
      tier: 'direct' as CostTier,
    })),
    ...figures.expenses.map((row) => ({
      label: expenseCategoryLabel(row.category),
      note: 'Expense vouchers',
      amount: row.amount,
      tier: expenseCategoryTier(row.category),
    })),
    {
      label: 'Salary',
      note: 'Payroll marked paid',
      amount: figures.salary,
      tier: 'operating' as CostTier,
    },
    {
      label: 'Reimbursed Claims',
      note: 'Staff claims paid back',
      amount: figures.claims,
      tier: 'operating' as CostTier,
    },
  ].filter((row) => !row.amount.isZero());

  const total = rows.reduce((sum, row) => sum.add(row.amount), Money.ZERO);

  return (
    <>
      <PageTitle
        title="Expense Register"
        subtitle="Every cost in the range, under the tier of the profit statement it falls in."
      />

      <RangePicker basePath="/reports/expenses" range={range} />

      <div className="max-w-3xl space-y-4">
        {COST_TIERS.map((tier) => {
          const inTier = rows.filter((row) => row.tier === tier.value);
          const tierTotal = inTier.reduce(
            (sum, row) => sum.add(row.amount),
            Money.ZERO,
          );
          const share = marginPercent(tierTotal, total);

          return (
            <Card key={tier.value}>
              <CardHeader
                title={tier.label}
                action={
                  <span className="text-sm text-[var(--color-muted)]">
                    {formatTaka(tierTotal)}
                    {share ? ` (${share} of cost)` : ''}
                  </span>
                }
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th>Source</Th>
                    <Th numeric>Amount (Tk)</Th>
                  </tr>
                </thead>
                <tbody>
                  {inTier.length === 0 ? (
                    <EmptyRow columns={3}>
                      Nothing recorded in this range
                    </EmptyRow>
                  ) : (
                    inTier.map((row) => (
                      <tr key={`${row.tier}-${row.label}`}>
                        <Td>{row.label}</Td>
                        <Td className="text-[var(--color-muted)]">{row.note}</Td>
                        <Td numeric>{formatTaka(row.amount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
          );
        })}

        <Card>
          <Table>
            <tbody>
              <tr className="font-semibold">
                <Td>Total Cost, {rangeLabel(range)}</Td>
                <Td numeric>{formatTaka(total)}</Td>
              </tr>
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
