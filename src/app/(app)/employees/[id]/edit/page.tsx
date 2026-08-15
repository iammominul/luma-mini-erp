import { notFound, permanentRedirect } from 'next/navigation';
import { EmployeeForm } from '@/components/EmployeeForm';
import { PageTitle } from '@/components/ui';
import { isUuid } from '@/lib/ids';
import { findEmployee } from '@/lib/queries';
import { updateEmployeeAction } from '../../actions';
import { requirePermission } from '@/lib/session';

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('employee:manage');
  const { id } = await params;
  const employee = await findEmployee(id);
  if (!employee) notFound();

  if (isUuid(id) && employee.code) {
    permanentRedirect(`/employees/${employee.code}/edit`);
  }

  return (
    <>
      <PageTitle
        title={`Edit ${employee.name}`}
        subtitle="The old and new values are both kept in the activity log."
      />
      <EmployeeForm
        action={updateEmployeeAction}
        submitLabel="Save Changes"
        cancelHref={`/employees/${employee.code ?? employee.id}`}
        requireReason
        employeeId={employee.id}
        values={{
          code: employee.code ?? '',
          name: employee.name,
          designation: employee.designation ?? '',
          phone: employee.phone ?? '',
          nid: employee.nid ?? '',
          address: employee.address ?? '',
          joinedOn: employee.joinedOn ?? '',
          basic: employee.basic.toDecimalString(),
          houseRent: employee.houseRent.toDecimalString(),
          medical: employee.medical.toDecimalString(),
          conveyance: employee.conveyance.toDecimalString(),
          mobileAllowance: employee.mobileAllowance.toDecimalString(),
          otherAllowance: employee.otherAllowance.toDecimalString(),
          paymentMethod: employee.paymentMethod,
          bankName: employee.bankName ?? '',
          accountNo: employee.accountNo ?? '',
          mfsNumber: employee.mfsNumber ?? '',
        }}
      />
    </>
  );
}
