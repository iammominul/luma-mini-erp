import { ExpenseForm } from '@/components/ExpenseForm';
import { PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { createExpenseAction } from '../actions';
import { requirePermission } from '@/lib/session';
import { expenseOrderOptions } from '../order-options';

export default async function NewExpensePage() {
  await requirePermission('expense:manage');
  const orderOptions = await expenseOrderOptions();
  return (
    <>
      <PageTitle title="New Expense" subtitle="Issued on save." />
      <ExpenseForm
        action={createExpenseAction}
        submitLabel="Save Expense"
        cancelHref="/expenses"
        orderOptions={orderOptions}
        values={{
          spentOn: todayInDhaka(),
          category: 'other',
          payee: '',
          description: '',
          amount: '',
          mode: 'cash',
          reference: '',
          orderNo: '',
          salesOrderId: '',
          orderLineId: '',
          notes: '',
        }}
      />
    </>
  );
}
