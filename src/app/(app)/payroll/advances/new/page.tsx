import Link from 'next/link';
import { AdvanceForm } from '@/components/AdvanceForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listEmployees } from '@/lib/queries';
import { createAdvanceAction } from '../../actions';
import { requirePermission } from '@/lib/session';

export default async function NewAdvancePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  await requirePermission('payroll:manage');
  const { employee } = await searchParams;
  const employees = await listEmployees({ activeOnly: true });

  return (
    <>
      <PageTitle
        title="New Salary Advance"
        subtitle="Recovered from a later salary. The voucher number is issued when this is saved."
      />

      {employees.length === 0 ? (
        <Notice tone="error">
          There are no active employees yet.{' '}
          <Link href="/employees/new" className="underline">
            Add one on the Employees page
          </Link>{' '}
          first.
        </Notice>
      ) : (
        <AdvanceForm
          employees={employees.map((e) => ({
            id: e.id,
            name: e.name,
            code: e.code,
          }))}
          action={createAdvanceAction}
          submitLabel="Save Advance"
          cancelHref="/payroll/advances"
          values={{
            employeeId: employee ?? '',
            paidOn: todayInDhaka(),
            amount: '',
            mode: 'cash',
            recoveryMode: 'manual',
            installmentAmount: '',
            recoverFrom: '',
            reference: '',
            notes: '',
          }}
        />
      )}
    </>
  );
}
