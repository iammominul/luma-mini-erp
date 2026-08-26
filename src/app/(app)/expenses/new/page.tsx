import { ExpenseForm } from '@/components/ExpenseForm';
import { PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { createExpenseAction } from '../actions';
import { requirePermission } from '@/lib/session';

export default async function NewExpensePage() {
  await requirePermission('expense:manage');
  return (
    <>
      <PageTitle title="New Expense" subtitle="Issued on save." />
      <ExpenseForm
        action={createExpenseAction}
        submitLabel="Save Expense"
        cancelHref="/expenses"
        values={{
          spentOn: todayInDhaka(),
          category: 'other',
          payee: '',
          description: '',
          amount: '',
          mode: 'cash',
          reference: '',
          orderNo: '',
          notes: '',
        }}
      />
    </>
  );
}
