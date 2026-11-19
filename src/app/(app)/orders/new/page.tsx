import { SalesOrderForm } from '@/components/SalesOrderForm';
import { PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { listParties } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { createSalesOrderAction } from '../actions';

export default async function NewSalesOrderPage() {
  const user = await requirePermission('bill:manage');
  const customers = await listParties({ role: 'customer' });
  return (
    <>
      <PageTitle title="New Sales Order" />
      <SalesOrderForm
        customers={customers.map((p) => ({ id: p.id, name: p.name }))}
        action={createSalesOrderAction}
        submitLabel="Save Sales Order"
        cancelHref="/orders"
        canCreateParty={can(user.role, 'party:manage')}
        values={{
          partyId: '',
          orderDate: todayInDhaka(),
          customerRef: '',
          notes: '',
          lines: [],
        }}
      />
    </>
  );
}
