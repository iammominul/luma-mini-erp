import { LoanForm } from '@/components/LoanForm';
import { PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { requirePermission } from '@/lib/session';
import { createLoanAction } from '../actions';

export default async function NewLoanPage() {
  await requirePermission('fund:manage');
  return (
    <>
      <PageTitle title="New Loan" subtitle="Records the money received too." />
      <LoanForm
        action={createLoanAction}
        submitLabel="Save Loan"
        cancelHref="/loans"
        values={{
          lender: '',
          amount: '',
          takenOn: todayInDhaka(),
          mode: 'bank_transfer',
          terms: '',
          reference: '',
          notes: '',
        }}
      />
    </>
  );
}
