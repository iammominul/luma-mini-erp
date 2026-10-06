import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { FILTER_CONTROL, FilterBar, FilterField } from '@/components/FilterBar';
import { StageTag } from '@/components/OrderTags';
import { Card, LinkButton, PageTitle } from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { type SalesOrderSummary, listParties, listSalesOrders } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { ORDER_STATUSES, orderCategoryLabel } from '@/lib/types';

type Search = { party?: string; status?: string; q?: string };

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requirePermission('bill:read');
  const filters = await searchParams;
  const [customers, orders] = await Promise.all([
    listParties({ role: 'customer', includeInactive: true }),
    listSalesOrders({
      partyId: filters.party || null,
      status: filters.status || null,
      search: filters.q || null,
    }),
  ]);

  const columns: Column<SalesOrderSummary>[] = [
    {
      key: 'docNo',
      head: 'SO No',
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap font-medium',
      phone: 'meta',
      cell: (order) => (
        <Link href={`/orders/${order.docNo}`} className="text-[var(--color-navy)] hover:underline">
          {order.docNo}
        </Link>
      ),
    },
    {
      key: 'date',
      head: 'Date',
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (order) => formatDate(order.orderDate),
    },
    {
      key: 'party',
      head: 'Customer',
      phone: 'title',
      cell: (order) => order.partyName,
    },
    {
      key: 'ref',
      head: 'Customer PO / WO',
      headClassName: 'w-36',
      cellClassName: 'text-[var(--color-muted)]',
      phone: 'meta',
      cell: (order) => order.customerRef ?? '',
    },
    {
      key: 'category',
      head: 'Sells',
      headClassName: 'w-36',
      phone: 'off',
      cell: (order) => order.categories.map(orderCategoryLabel).join(', '),
    },
    {
      key: 'booked',
      head: 'Booked Value',
      numeric: true,
      phone: 'off',
      cell: (order) => formatTaka(order.bookedValue),
    },
    {
      key: 'billed',
      head: 'Billed',
      numeric: true,
      phone: 'amount',
      cell: (order) => formatTaka(order.billed),
    },
    {
      key: 'stage',
      head: 'Stage',
      headClassName: 'w-28',
      phone: 'meta',
      cell: (order) => <StageTag stage={order.stage} />,
    },
  ];

  return (
    <>
      <PageTitle
        title="Sales Orders"
        action={
          <LinkButton href="/orders/new" icon="plus">
            New Sales Order
          </LinkButton>
        }
      />
      <FilterBar clearHref="/orders">
        <FilterField label="Customer">
          <select name="party" defaultValue={filters.party ?? ''} className={FILTER_CONTROL}>
            <option value="">All</option>
            {customers.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={filters.status ?? ''} className={FILTER_CONTROL}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Search">
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ''}
            className={FILTER_CONTROL}
            placeholder="SO No, reference, customer"
          />
        </FilterField>
      </FilterBar>
      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={orders}
          rowKey={(order) => order.id}
          rowHref={(order) => `/orders/${order.docNo}`}
          rowClassName="hover:bg-[var(--color-canvas)]"
          empty="No sales orders for this filter"
          total={{
            label: `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`,
            cells: {
              booked: formatTaka(sumMoney(orders.map((o) => o.bookedValue))),
              billed: formatTaka(sumMoney(orders.map((o) => o.billed))),
            },
          }}
        />
      </Card>
    </>
  );
}
