import { notFound } from 'next/navigation';
import { AdvanceForm } from '@/components/AdvanceForm';
import { PageTitle } from '@/components/ui';
import { getAdvance, listEmployees } from '@/lib/queries';
import { updateAdvanceAction } from '../../../actions';
import { requirePermission } from '@/lib/session';

export default async function EditAdvancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('payroll:manage');
  const { id } = await params;
  const [advance, employees] = await Promise.all([
    getAdvance(id),
    listEmployees(),
  ]);
  if (!advance) notFound();

  return (
    <>
      <PageTitle title={`Edit Advance ${advance.docNo ?? ''}`} />
      <AdvanceForm
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          code: e.code,
        }))}
        action={updateAdvanceAction}
        submitLabel="Save Changes"
        cancelHref="/payroll/advances"
        requireReason
        advanceId={advance.id}
        values={{
          employeeId: advance.employeeId,
          paidOn: advance.paidOn,
          amount: advance.amount.toDecimalString(),
          mode: advance.mode,
          recoveryMode: advance.recoveryMode,
          installmentAmount: advance.installmentAmount?.toDecimalString() ?? '',
          recoverFrom: advance.recoverFrom ?? '',
          reference: advance.reference ?? '',
          notes: advance.notes ?? '',
        }}
      />
    </>
  );
}
