import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { StatusTag } from '@/components/OrderTags';
import { StatusBox } from '@/components/StatusBox';
import {
  Card,
  CardHeader,
  DocLinks,
  LinkButton,
  RecordHead,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatRate } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { Money } from '@/lib/money';
import { ORDER_STAGES, orderCosting } from '@/lib/order-costing';
import { can } from '@/lib/permissions';
import {
  findSalesOrder,
  listSalesOrders,
  salesOrderDocuments,
  salesOrderFigures,
} from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { sideForRole } from '@/lib/side';
import {
  expenseCategoryLabel,
  orderCategoryLabel,
  orderStatusLabel,
  workProcessLabel,
} from '@/lib/types';
import { setSalesOrderStatusAction } from '../actions';

/** A figure, or blank where it is nothing, so a column reads as what is there. */
const cell = (value: Money) => (value.isZero() ? '' : formatTaka(value));

/**
 * The path an order walks, in order, for the stage bar. Cancelled is not a
 * step on it: a cancelled order has left the path, and the bar says so.
 */
const PATH = ORDER_STAGES.filter((step) => step.value !== 'cancelled');

export default async function SalesOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('bill:read');
  const { id } = await params;
  const order = await findSalesOrder(id);
  if (!order) notFound();
  if (isUuid(id)) permanentRedirect(`/orders/${order.docNo}`);

  const [figures, docs] = await Promise.all([
    salesOrderFigures(order.id),
    salesOrderDocuments(order.id),
  ]);
  const result = orderCosting(figures!);
  // The stage comes from the same query the list reads it from, so the two
  // screens can never show one order at different stages.
  const summary = (await listSalesOrders({ search: order.docNo })).find(
    (o) => o.id === order.id,
  );
  const stage = summary?.stage ?? 'booked';
  const mayEdit = can(user.role, 'bill:manage');
  const isOpen = order.status === 'open';

  return (
    <>
      <RecordHead
        back={{ href: '/orders', label: 'Sales Orders' }}
        kind="Sales Order"
        number={order.docNo}
        tags={<StatusTag status={order.status} />}
        facts={[
          { label: 'Customer', value: order.partyName },
          { label: 'Date', value: formatDate(order.orderDate) },
          ...(order.customerRef
            ? [{ label: 'Customer PO / WO', value: order.customerRef }]
            : []),
          {
            label: 'Documents',
            value: (
              <DocLinks
                links={[
                  {
                    text: `${docs.purchaseOrders.length} PO, ${docs.workOrders.length} WO`,
                    href: '#orders-issued',
                  },
                  {
                    text: `${docs.bills.length} ${docs.bills.length === 1 ? 'bill' : 'bills'}, ${docs.expenses.length} ${docs.expenses.length === 1 ? 'expense' : 'expenses'}`,
                    href: '#bills-and-expenses',
                  },
                ]}
              />
            ),
          },
        ]}
        stages={{
          steps: PATH.map((step) => step.label),
          current: PATH.findIndex((step) => step.value === stage),
          void: stage === 'cancelled' ? 'Cancelled' : undefined,
        }}
        figures={[
          { label: 'Booked', value: formatTaka(result.bookedValue) },
          { label: 'Billed', value: formatTaka(result.billed) },
          {
            label: 'Direct Cost',
            value: formatTaka(result.directCost),
          },
          {
            label: 'Contribution',
            value: `${formatTaka(result.contribution)}${
              result.contributionPercent
                ? `  (${result.contributionPercent})`
                : ''
            }`,
            strong: true,
          },
        ]}
        actions={
          mayEdit ? (
            <>
              {isOpen ? (
                <>
                  <LinkButton href={`/purchase-orders/new?order=${order.docNo}`} variant="secondary" icon="plus">
                    New PO
                  </LinkButton>
                  <LinkButton href={`/work-orders/new?order=${order.docNo}`} variant="secondary" icon="plus">
                    New WO
                  </LinkButton>
                  <LinkButton href={`/orders/${order.docNo}/edit`} variant="secondary" icon="edit">
                    Edit
                  </LinkButton>
                </>
              ) : null}
              <StatusBox action={setSalesOrderStatusAction} id={order.id} status={order.status} />
            </>
          ) : undefined
        }
      />

      {/* What each line earned and cost, from the documents filed against it.
          Ordered beside Billed for the work sent out, so work done and not yet
          billed reads as incomplete rather than cheap. */}
      <Card>
        <CardHeader title="Order Costing" />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th className="w-8">No</Th>
                <Th>Line</Th>
                <Th numeric>Booked</Th>
                <Th numeric>Billed</Th>
                <Th numeric>Yarn</Th>
                <Th numeric>Knitting</Th>
                <Th numeric>Dyeing</Th>
                <Th numeric>Transport</Th>
                <Th numeric>Other Direct</Th>
                <Th numeric>Contribution</Th>
                <Th numeric className="w-16">
                  %
                </Th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => (
                <tr key={line.lineId}>
                  <Td className="text-ink-3">{line.lineNo}</Td>
                  <Td>
                    <div>{line.description}</div>
                    <div className="text-xs text-ink-3">
                      {[
                        orderCategoryLabel(line.category),
                        line.color,
                        `${line.quantity} kg at ${formatRate(line.rate)}`,
                      ]
                        .filter(Boolean)
                        .join(' | ')}
                    </div>
                  </Td>
                  <Td numeric>{formatTaka(line.bookedValue)}</Td>
                  <Td numeric>{cell(line.billed)}</Td>
                  <Td numeric>{cell(line.yarnBilled)}</Td>
                  <Td numeric>{cell(line.knittingBilled)}</Td>
                  <Td numeric>{cell(line.dyeingBilled)}</Td>
                  <Td numeric>{cell(line.transport)}</Td>
                  <Td numeric>{cell(line.otherDirect)}</Td>
                  <Td numeric className="font-medium">
                    {formatTaka(line.contribution)}
                  </Td>
                  <Td numeric>{line.contributionPercent ?? ''}</Td>
                </tr>
              ))}
              {!result.orderLevel.directCost.isZero() ||
              !result.orderLevel.selling.isZero() ? (
                <tr>
                  <Td />
                  <Td className="text-ink-3">Order Level</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  <Td numeric>{cell(result.orderLevel.transport)}</Td>
                  <Td numeric>{cell(result.orderLevel.otherDirect)}</Td>
                  <Td numeric>
                    {formatTaka(
                      Money.ZERO.subtract(
                        result.orderLevel.directCost.add(result.orderLevel.selling),
                      ),
                    )}
                  </Td>
                  <Td />
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <Td colSpan={2}>Total</Td>
                <Td numeric>{formatTaka(result.bookedValue)}</Td>
                <Td numeric>{formatTaka(result.billed)}</Td>
                <Td colSpan={5} numeric className="text-ink-3">
                  Direct cost {formatTaka(result.directCost)}
                  {result.sellingCost.isZero()
                    ? ''
                    : `, selling ${formatTaka(result.sellingCost)}`}
                </Td>
                <Td numeric>{formatTaka(result.contribution)}</Td>
                <Td numeric>{result.contributionPercent ?? ''}</Td>
              </tr>
            </tfoot>
          </Table>
        </div>
        {!result.unbilledCommitment.isZero() ? (
          <p className="border-t border-rule px-4 py-2 text-xs text-ink-3">
            Ordered on a PO or WO and not yet billed:{' '}
            {formatTaka(result.unbilledCommitment)}. Contribution falls by up to
            that much when it is.
          </p>
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card id="orders-issued">
          <CardHeader title="Purchase and Work Orders" />
          <Table>
            <tbody>
              {docs.purchaseOrders.map((doc) => (
                <tr key={doc.docNo}>
                  <Td className="w-28">
                    <Link href={`/purchase-orders/${doc.docNo}`} className="link">
                      {doc.docNo}
                    </Link>
                  </Td>
                  <Td>Yarn, {doc.partyName}</Td>
                  <Td className="w-28">{formatDate(doc.date)}</Td>
                  <Td className="w-24 text-ink-3">{orderStatusLabel(doc.status)}</Td>
                </tr>
              ))}
              {docs.workOrders.map((doc) => (
                <tr key={doc.docNo}>
                  <Td className="w-28">
                    <Link href={`/work-orders/${doc.docNo}`} className="link">
                      {doc.docNo}
                    </Link>
                  </Td>
                  <Td>
                    {workProcessLabel(doc.process)}, {doc.partyName}
                  </Td>
                  <Td className="w-28">{formatDate(doc.date)}</Td>
                  <Td className="w-24 text-ink-3">{orderStatusLabel(doc.status)}</Td>
                </tr>
              ))}
              {docs.purchaseOrders.length + docs.workOrders.length === 0 ? (
                <tr>
                  <Td className="text-ink-3">None issued</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        <Card id="bills-and-expenses">
          <CardHeader title="Bills and Expenses" />
          <Table>
            <tbody>
              {docs.bills.map((bill) => (
                <tr key={bill.id}>
                  <Td className="w-28">
                    <Link
                      href={`/${sideForRole(bill.partyRole)}/bills/${bill.docNo ?? bill.id}`}
                      className="link"
                    >
                      {bill.docNo ?? bill.billNo}
                    </Link>
                  </Td>
                  <Td>{bill.partyName}</Td>
                  <Td className="w-28">{formatDate(bill.date)}</Td>
                  <Td numeric className="w-32">
                    {formatTaka(bill.amount)}
                  </Td>
                </tr>
              ))}
              {docs.expenses.map((expense, index) => (
                <tr key={`${expense.docNo}-${index}`}>
                  <Td className="w-28">{expense.docNo}</Td>
                  <Td>
                    {expenseCategoryLabel(expense.category)}
                    {expense.lineNo ? `, line ${expense.lineNo}` : ', whole order'}
                  </Td>
                  <Td className="w-28">{formatDate(expense.date)}</Td>
                  <Td numeric className="w-32">
                    {formatTaka(expense.amount)}
                  </Td>
                </tr>
              ))}
              {docs.bills.length + docs.expenses.length === 0 ? (
                <tr>
                  <Td className="text-ink-3">Nothing billed yet</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      </div>

      {order.notes ? (
        <Card className="mt-4 p-4 text-sm whitespace-pre-line">
          <span className="font-medium">Remarks: </span>
          {order.notes}
        </Card>
      ) : null}
    </>
  );
}
