import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  Card,
  CardHeader,
  Notice,
  PageTitle,
  StatTile,
} from '@/components/ui';
import type { OrderMargin } from '@/lib/costing';
import { coverage, orderMargin } from '@/lib/costing';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { orderCosting } from '@/lib/queries';
import { RangePicker, readRange } from '../range';

export const dynamic = 'force-dynamic';

const orderColumns: Column<OrderMargin>[] = [
  {
    key: 'order',
    head: 'Order',
    phone: 'title',
    cell: (order) => (
      <Link
        href={`/reports/orders/${encodeURIComponent(order.orderNo)}`}
        className="text-[var(--color-navy)] hover:underline"
      >
        {order.orderNo}
      </Link>
    ),
  },
  {
    key: 'revenue',
    head: 'Billed',
    numeric: true,
    cell: (order) => formatTaka(order.revenue),
  },
  {
    key: 'directCost',
    head: 'Direct Cost',
    numeric: true,
    cell: (order) => formatTaka(order.directCost),
  },
  {
    key: 'sellingCost',
    head: 'Selling Cost',
    numeric: true,
    cell: (order) => formatTaka(order.sellingCost),
  },
  {
    key: 'contribution',
    head: 'Contribution',
    numeric: true,
    cellClassName: '',
    phone: 'full',
    phoneClassName:
      'border-t border-[var(--color-line)] pt-2 text-base font-semibold',
    cell: (order) => (
      <span className={order.contribution.isNegative() ? 'text-red-700' : ''}>
        {formatTaka(order.contribution)}
      </span>
    ),
  },
  {
    key: 'margin',
    head: 'Margin',
    numeric: true,
    cellClassName: 'text-[var(--color-muted)]',
    phone: 'meta',
    cell: (order) => order.contributionPercent ?? '',
  },
];

/**
 * What each order earned, as far as this app can honestly say.
 *
 * It stops at contribution. Rent and salary are never split across orders,
 * because choosing a basis to split them on is a decision this app has no way
 * to make and a made up basis produces a made up per order profit that somebody
 * would then quote a customer from.
 *
 * The coverage line above the table is not decoration. An order whose freight
 * was keyed without its reference does not look more expensive, it looks
 * complete when it is not, so the report states how much of the period's money
 * actually carries a reference and lets the reader judge the rest.
 */
export default async function OrderCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = readRange(await searchParams);
  const { orders, attributed, total } = await orderCosting(range.from, range.to);

  const margins = orders.map((order) => orderMargin(order));
  const revenueCoverage = coverage(attributed.revenue, total.revenue);
  const costCoverage = coverage(attributed.cost, total.cost);

  const attributedContribution = margins.reduce(
    (sum, order) => sum.add(order.contribution),
    Money.ZERO,
  );

  return (
    <>
      <PageTitle
        title="Order Costing"
        subtitle="What each order billed, what it cost, and what it contributed."
      />

      <RangePicker basePath="/reports/orders" range={range} />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Orders Costed"
          value={String(margins.length)}
          note="Carrying an order reference"
        />
        <StatTile
          label="Contribution"
          value={formatTaka(attributedContribution)}
          note="Across the orders below"
        />
        <StatTile
          label="Billing Referenced"
          value={revenueCoverage.percent ?? 'None'}
          note={`${formatTaka(revenueCoverage.unattributed)} carries no reference`}
        />
      </div>

      {/* Coverage is the honest health warning on this whole report. */}
      {revenueCoverage.unattributed.isZero() && costCoverage.unattributed.isZero() ? null : (
        <Notice tone="info">
          {formatTaka(revenueCoverage.unattributed)} of billing and{' '}
          {formatTaka(costCoverage.unattributed)} of cost in this range carry no
          order reference, so they are not in any row below. An order is only
          costed as completely as its documents were keyed.
        </Notice>
      )}

      <Card className="mt-4">
        <CardHeader title="By Order" />
        <DataTable
          columns={orderColumns}
          rows={margins}
          rowKey={(order) => order.orderNo}
          rowClassName="hover:bg-gray-50"
          empty="No order references recorded in this range"
        />
        <div className="border-t border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
          Contribution is billing less the direct and selling cost recorded
          against that order. Rent, salary and other overhead are never split
          across orders, because there is no basis here to split them on and a
          made up one would produce a made up profit. An order that covers its
          own cost is contributing to the overhead.
        </div>
      </Card>
    </>
  );
}
