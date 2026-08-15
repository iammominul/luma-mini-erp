import { type CostLine, profitStatement, type ProfitStatement } from './costing';
import { profitFigures } from './queries';
import {
  expenseCategoryLabel,
  expenseCategoryTier,
  natureOfWorkLabel,
} from './types';

/**
 * The profit statement for a period, read and assembled in one place.
 *
 * The dashboard, the Reports screen and the PDF all come through here, so the
 * three cannot disagree about what a cost is or which tier it belongs to. The
 * tier itself is never decided here: it comes from the category the cost was
 * recorded under, in EXPENSE_CATEGORIES.
 */
export async function statementFor(
  from: string,
  to: string,
): Promise<ProfitStatement> {
  const figures = await profitFigures(from, to);

  const costs: CostLine[] = [
    // A subcontractor's bill is cost of sales whatever the work was, and it is
    // split by nature of work so knitting reads apart from dyeing.
    ...figures.subcontract.map((row) => ({
      label: natureOfWorkLabel(row.natureOfWork),
      amount: row.amount,
      tier: 'direct' as const,
    })),
    ...figures.expenses.map((row) => ({
      label: expenseCategoryLabel(row.category),
      amount: row.amount,
      tier: expenseCategoryTier(row.category),
    })),
    { label: 'Salary', amount: figures.salary, tier: 'operating' as const },
    // Reimbursing a claim is money leaving the business. Nothing counted it for
    // a while, and the net result shown was too high by exactly that amount.
    {
      label: 'Reimbursed Claims',
      amount: figures.claims,
      tier: 'operating' as const,
    },
  ].filter((line) => !line.amount.isZero());

  return profitStatement({ revenue: figures.revenue, costs });
}
