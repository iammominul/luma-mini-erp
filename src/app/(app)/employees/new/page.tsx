import { EmployeeForm } from '@/components/EmployeeForm';
import { PageTitle } from '@/components/ui';
import { createEmployeeAction } from '../actions';
import { requirePermission } from '@/lib/session';

export default async function NewEmployeePage() {
  await requirePermission('employee:manage');
  return (
    <>
      <PageTitle title="New Employee" />
      <EmployeeForm
        action={createEmployeeAction}
        submitLabel="Save Employee"
        cancelHref="/employees"
        values={{
          code: '',
          name: '',
          designation: '',
          phone: '',
          nid: '',
          address: '',
          joinedOn: '',
          basic: '',
          houseRent: '',
          medical: '',
          conveyance: '',
          mobileAllowance: '',
          otherAllowance: '',
          paymentMethod: 'cash',
          bankName: '',
          accountNo: '',
          mfsNumber: '',
        }}
      />
    </>
  );
}
