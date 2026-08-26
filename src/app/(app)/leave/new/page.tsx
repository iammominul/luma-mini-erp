import Link from 'next/link';
import { LeaveForm } from '@/components/LeaveForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listEmployees } from '@/lib/queries';
import { createLeaveAction } from '../actions';
import { requirePermission } from '@/lib/session';

export default async function NewLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  await requirePermission('employee:manage');
  const { employee } = await searchParams;
  const employees = await listEmployees({ activeOnly: true });

  return (
    <>
      <PageTitle
        title="Record Leave"
        subtitle="Does not change a salary."
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
        <LeaveForm
          employees={employees.map((e) => ({
            id: e.id,
            name: e.name,
            code: e.code,
          }))}
          action={createLeaveAction}
          cancelHref="/leave"
          defaultEmployeeId={employee ?? ''}
          today={todayInDhaka()}
        />
      )}
    </>
  );
}
