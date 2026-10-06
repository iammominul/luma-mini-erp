import {
  type CostLine,
  profitStatement,
  type ProfitStatement,
} from './costing';
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
    // A bill received is cost of sales whatever it was for, and it is split by
    // nature of work so knitting reads apart from dyeing. A supplier's bill is
    // always yarn (2026-10-06), so Yarn is its own direct cost line.
    ...figures.subcontract.map((row) => ({
      label: natureOfWorkLabel(row.natureOfWork),
      note: row.natureOfWork === 'yarn' ? 'Supplier bills' : 'Subcontractor bills',
      amount: row.amount,
      tier: 'direct' as const,
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
      tier: 'operating' as const,
    },
    // Interest and charges on a working capital loan: the ERP's posting rule 17
    // and its account 5500. The principal beside it is deliberately never here.
    // Repaying a loan settles a liability and costs nothing, and a statement
    // that counted the principal would report a loss in every month a loan is
    // being paid down.
    {
      label: 'Loan Interest',
      note: 'Loan repayments',
      amount: figures.interest,
      tier: 'operating' as const,
    },
  ].filter((line) => !line.amount.isZero());

  return profitStatement({ revenue: figures.revenue, costs });
}
