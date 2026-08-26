import { notFound, permanentRedirect } from 'next/navigation';
import { DeleteBox } from '@/components/DeleteBox';
import { LoanForm } from '@/components/LoanForm';
import { Notice, PageTitle } from '@/components/ui';
import { isUuid } from '@/lib/ids';
import { findLoan, loanMovementCount } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { deleteLoanAction, updateLoanAction } from '../../actions';

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requirePermission('fund:manage');
  const { code } = await params;
  const loan = await findLoan(code);
  if (!loan) notFound();

  if (isUuid(code) && loan.code) {
    permanentRedirect(`/loans/${loan.code}/edit`);
  }

  const movements = await loanMovementCount(loan.id);

  return (
    <>
      <PageTitle title={`Edit ${loan.code ?? 'Loan'}`} />

      <LoanForm
        action={updateLoanAction}
        submitLabel="Save Changes"
        cancelHref={`/loans/${loan.code ?? loan.id}`}
        requireReason
        showActive
        loanId={loan.id}
        values={{
          lender: loan.lender,
          amount: '',
          takenOn: loan.takenOn,
          mode: 'bank_transfer',
          terms: loan.terms ?? '',
          reference: loan.reference ?? '',
          active: loan.active ? 'yes' : '',
          notes: loan.notes ?? '',
        }}
      />

      <div className="mt-6 max-w-3xl">
        {movements > 0 ? (
          <Notice>
            {movements} {movements === 1 ? 'entry is' : 'entries are'} recorded
            against this loan, so it cannot be removed. Set it to Settled above
            once it is paid off: the entries keep the lender they were paid to.
          </Notice>
        ) : (
          <DeleteBox
            action={deleteLoanAction}
            id={loan.id}
            side="loans"
            title="Remove This Loan"
            confirmLabel="Remove Loan"
          />
        )}
      </div>
    </>
  );
}
