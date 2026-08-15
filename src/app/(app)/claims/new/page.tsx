import Link from 'next/link';
import { ClaimForm } from '@/components/ClaimForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listEmployees } from '@/lib/queries';
import { createClaimAction } from '../actions';
import { requirePermission } from '@/lib/session';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  await requirePermission('expense:manage');
  const { employee } = await searchParams;
  const employees = await listEmployees({ activeOnly: true });

  return (
    <>
      <PageTitle
        title="New Expense Claim"
        subtitle="The claim number is issued when this is saved."
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
        <ClaimForm
          employees={employees.map((e) => ({
            id: e.id,
            name: e.name,
            code: e.code,
          }))}
          action={createClaimAction}
          cancelHref="/claims"
          defaultEmployeeId={employee ?? ''}
          today={todayInDhaka()}
        />
      )}
    </>
  );
}
