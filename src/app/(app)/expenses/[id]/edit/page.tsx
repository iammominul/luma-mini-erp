import { notFound, permanentRedirect } from 'next/navigation';
import { ExpenseForm } from '@/components/ExpenseForm';
import { PageTitle } from '@/components/ui';
import { isUuid } from '@/lib/ids';
import { findExpense } from '@/lib/queries';
import { updateExpenseAction } from '../../actions';
import { requirePermission } from '@/lib/session';

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('expense:manage');
  const { id } = await params;
  const expense = await findExpense(id);
  if (!expense) notFound();

  // One record, one address: a uuid resolves but answers with the voucher
  // number rather than serving the page at a second URL.
  if (isUuid(id) && expense.docNo) {
    permanentRedirect(`/expenses/${expense.docNo}/edit`);
  }

  return (
    <>
      <PageTitle title={`Edit Expense ${expense.docNo ?? ''}`} />
      <ExpenseForm
        action={updateExpenseAction}
        submitLabel="Save Changes"
        cancelHref="/expenses"
        requireReason
        expenseId={expense.id}
        values={{
          spentOn: expense.spentOn,
          category: expense.category,
          payee: expense.payee ?? '',
          description: expense.description,
          amount: expense.amount.toDecimalString(),
          mode: expense.mode,
          reference: expense.reference ?? '',
          orderNo: expense.orderNo ?? '',
          notes: expense.notes ?? '',
        }}
      />
    </>
  );
}
