import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { orderMargin } from '@/lib/costing';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { orderDetail } from '@/lib/queries';
import {
  expenseCategoryLabel,
  expenseCategoryTier,
  natureOfWorkLabel,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Every document carrying one order reference, and what they come to. */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo: raw } = await params;
  const orderNo = decodeURIComponent(raw);
  const { bills, expenses } = await orderDetail(orderNo);

  // An order reference nothing was recorded against is a mistyped address, not
  // an empty report.
  if (bills.length === 0 && expenses.length === 0) notFound();

  const revenue = bills
    .filter((row) => row.direction === 'issued')
    .reduce((sum, row) => sum.add(row.amount), Money.ZERO);
  const subcontract = bills
    .filter((row) => row.direction === 'received')
    .reduce((sum, row) => sum.add(row.amount), Money.ZERO);
  const directExpense = expenses
    .filter((row) => expenseCategoryTier(row.category) === 'direct')
    .reduce((sum, row) => sum.add(row.amount), Money.ZERO);
  const sellingCost = expenses
    .filter((row) => expenseCategoryTier(row.category) === 'selling')
    .reduce((sum, row) => sum.add(row.amount), Money.ZERO);

  const margin = orderMargin({
    orderNo,
    revenue,
    directCost: subcontract.add(directExpense),
    sellingCost,
  });

  return (
    <>
      <PageTitle
        title={`Order ${orderNo}`}
        subtitle="Every bill and cost recorded against this order reference."
        action={
          <Link href="/reports/orders" className="text-sm underline">
            All Orders
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Billed to Customer" value={formatTaka(margin.revenue)} />
        <StatTile
          label="Direct Cost"
          value={formatTaka(margin.directCost)}
          note="Subcontract, freight, testing"
        />
        <StatTile label="Selling Cost" value={formatTaka(margin.sellingCost)} />
        <StatTile
          label="Contribution"
          value={formatTaka(margin.contribution)}
          note={
            margin.contributionPercent
              ? `${margin.contributionPercent} of billing`
              : 'Nothing billed on this order'
          }
        />
      </div>

      <Card className="mb-4">
        <CardHeader title="Bills" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Party</Th>
              <Th>Bill</Th>
              <Th>Work</Th>
              <Th>Description</Th>
              <Th numeric>Amount (Tk)</Th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <EmptyRow columns={6}>No bills against this order</EmptyRow>
            ) : (
              bills.map((row, index) => (
                <tr key={`${row.billNo}-${index}`}>
                  <Td className="whitespace-nowrap">{formatDate(row.billDate)}</Td>
                  <Td>
                    {row.partyName}
                    <span className="block text-xs text-[var(--color-muted)]">
                      {row.direction === 'issued'
                        ? 'Billed to customer'
                        : 'Billed by subcontractor'}
                    </span>
                  </Td>
                  <Td>{row.docNo ?? row.billNo}</Td>
                  <Td>{natureOfWorkLabel(row.natureOfWork)}</Td>
                  <Td>{row.description}</Td>
                  <Td numeric>
                    {row.direction === 'issued'
                      ? formatTaka(row.amount)
                      : `(${formatTaka(row.amount)})`}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Costs" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Voucher</Th>
              <Th>Category</Th>
              <Th>Description</Th>
              <Th numeric>Amount (Tk)</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <EmptyRow columns={5}>No costs against this order</EmptyRow>
            ) : (
              expenses.map((row, index) => (
                <tr key={`${row.docNo ?? index}`}>
                  <Td className="whitespace-nowrap">{formatDate(row.spentOn)}</Td>
                  <Td>{row.docNo ?? ''}</Td>
                  <Td>
                    {expenseCategoryLabel(row.category)}
                    {expenseCategoryTier(row.category) === 'operating' ? (
                      <span className="block text-xs text-[var(--color-muted)]">
                        Overhead, not counted against this order
                      </span>
                    ) : null}
                  </Td>
                  <Td>{row.description}</Td>
                  <Td numeric>({formatTaka(row.amount)})</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <div className="border-t border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
          A cost recorded under an overhead category is listed here because it
          carries this order reference, but it is left out of the contribution
          above. Overhead is never split across orders.
        </div>
      </Card>
    </>
  );
}
