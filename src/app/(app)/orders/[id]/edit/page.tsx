import { notFound, redirect } from 'next/navigation';
import { SalesOrderForm } from '@/components/SalesOrderForm';
import { PageTitle } from '@/components/ui';
import { formatQtyKg, formatRate, parseQtyKg } from '@/lib/amount';
import { can } from '@/lib/permissions';
import { findSalesOrder, listParties } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { updateSalesOrderAction } from '../../actions';

export default async function EditSalesOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('bill:manage');
  const { id } = await params;
  const [order, customers] = await Promise.all([
    findSalesOrder(id),
    listParties({ role: 'customer', includeInactive: true }),
  ]);
  if (!order) notFound();
  // A closed or cancelled order is reopened first, on its own screen.
  if (order.status !== 'open') redirect(`/orders/${order.docNo}`);

  return (
    <>
      <PageTitle title={`Edit Sales Order ${order.docNo}`} />
      <SalesOrderForm
        customers={customers.map((p) => ({ id: p.id, name: p.name }))}
        action={updateSalesOrderAction}
        submitLabel="Save Changes"
        cancelHref={`/orders/${order.docNo}`}
        orderId={order.id}
        docNo={order.docNo}
        canCreateParty={can(user.role, 'party:manage')}
        values={{
          partyId: order.partyId,
          orderDate: order.orderDate,
          customerRef: order.customerRef ?? '',
          notes: order.notes ?? '',
          lines: order.lines.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            color: line.color ?? '',
            // NUMERIC hands back "1000.000" and "520.000000", which is not
            // what anybody typed and not what they should be asked to edit.
            quantity: formatQtyKg(parseQtyKg(line.quantity)).replace(/,/g, ''),
            rate: formatRate(line.rate),
          })),
        }}
      />
    </>
  );
}
