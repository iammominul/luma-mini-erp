import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { FILTER_CONTROL, FilterBar, FilterField } from '@/components/FilterBar';
import { OrderDocForm, type OrderLineChoice } from '@/components/OrderDocForm';
import { StatusTag } from '@/components/OrderTags';
import { StatusBox } from '@/components/StatusBox';
import {
  Card,
  CardHeader,
  DownloadButton,
  LinkButton,
  PageTitle,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatQtyKg, formatRate, parseQtyKg } from '@/lib/amount';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { can } from '@/lib/permissions';
import {
  type OrderDocSummary,
  findPurchaseOrder,
  findSalesOrder,
  findWorkOrder,
  listOrderDocs,
  listOrderLineOptions,
  listParties,
} from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import {
  ORDER_STATUSES,
  type PurchaseOrder,
  type WorkOrder,
  type WorkOrderLine,
  orderCategoryLabel,
  workProcessLabel,
} from '@/lib/types';
import {
  saveOrderDocAction,
  setOrderDocStatusAction,
} from '@/app/(app)/work-orders/actions';

/**
 * The Purchase Order and Work Order screens, written once (2026-10-06). The
 * route files under /purchase-orders and /work-orders each call these with
 * their kind, because the two documents differ only in who they go to and two
 * fields a Work Order carries.
 */

type Kind = 'po' | 'wo';

const COPY = {
  po: {
    base: '/purchase-orders',
    title: 'Purchase Orders',
    singular: 'Purchase Order',
    short: 'PO',
    partyWord: 'Supplier',
    role: 'supplier' as const,
  },
  wo: {
    base: '/work-orders',
    title: 'Work Orders',
    singular: 'Work Order',
    short: 'WO',
    partyWord: 'Subcontractor',
    role: 'subcontractor' as const,
  },
};

const findDoc = (kind: Kind, handle: string) =>
  kind === 'po' ? findPurchaseOrder(handle) : findWorkOrder(handle);

/** Both kinds of line in one shape: a PO line has no color, GSM or dia. */
function linesOf(doc: PurchaseOrder | WorkOrder, kind: Kind): WorkOrderLine[] {
  return kind === 'wo'
    ? (doc as WorkOrder).lines
    : (doc as PurchaseOrder).lines.map((line) => ({
        ...line,
        color: null,
        gsm: null,
        dia: null,
      }));
}

/** What a picker shows for each order line, and whether it can take new work. */
async function orderLineChoices(): Promise<OrderLineChoice[]> {
  const lines = await listOrderLineOptions();
  return lines.map((line) => ({
    id: line.id,
    label: [
      `${line.orderDocNo} / ${line.lineNo}`,
      line.partyName,
      line.description,
      line.color,
    ]
      .filter(Boolean)
      .join(', '),
    category: line.category,
    open: line.orderStatus === 'open',
    description: line.description,
    color: line.color,
  }));
}

/** NUMERIC text back into what somebody would have typed. */
const plainKg = (value: string) => formatQtyKg(parseQtyKg(value)).replace(/,/g, '');

export async function OrderDocListScreen({
  kind,
  filters,
}: {
  kind: Kind;
  filters: { party?: string; status?: string };
}) {
  await requirePermission('bill:read');
  const copy = COPY[kind];
  const [parties, docs] = await Promise.all([
    listParties({ role: copy.role, includeInactive: true }),
    listOrderDocs(kind, { partyId: filters.party || null, status: filters.status || null }),
  ]);

  const columns: Column<OrderDocSummary>[] = [
    {
      key: 'docNo',
      head: `${copy.short} No`,
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap font-medium',
      phone: 'meta',
      cell: (doc) => (
        <Link href={`${copy.base}/${doc.docNo}`} className="text-[var(--color-navy)] hover:underline">
          {doc.docNo}
        </Link>
      ),
    },
    {
      key: 'date',
      head: 'Date',
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (doc) => formatDate(doc.date),
    },
    { key: 'party', head: copy.partyWord, phone: 'title', cell: (doc) => doc.partyName },
    ...(kind === 'wo'
      ? ([
          {
            key: 'process',
            head: 'Process',
            headClassName: 'w-36',
            phone: 'meta',
            cell: (doc) => (doc.process ? workProcessLabel(doc.process) : ''),
          },
        ] as Column<OrderDocSummary>[])
      : []),
    {
      key: 'orders',
      head: 'For Orders',
      phone: 'off',
      cellClassName: 'text-[var(--color-muted)]',
      cell: (doc) => doc.orderDocNos.join(', '),
    },
    {
      key: 'delivery',
      head: 'Delivery By',
      headClassName: 'w-28',
      phone: 'off',
      cell: (doc) => formatDate(doc.deliveryBy),
    },
    { key: 'total', head: 'Amount', numeric: true, phone: 'amount', cell: (doc) => formatTaka(doc.total) },
    { key: 'status', head: '', headClassName: 'w-24', phone: 'meta', cell: (doc) => <StatusTag status={doc.status} /> },
  ];

  return (
    <>
      <PageTitle
        title={copy.title}
        action={
          <LinkButton href={`${copy.base}/new`} icon="plus">
            New {copy.singular}
          </LinkButton>
        }
      />
      <FilterBar clearHref={copy.base}>
        <FilterField label={copy.partyWord}>
          <select name="party" defaultValue={filters.party ?? ''} className={FILTER_CONTROL}>
            <option value="">All</option>
            {parties.map((party) => (
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
      </FilterBar>
      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={docs}
          rowKey={(doc) => doc.id}
          rowHref={(doc) => `${copy.base}/${doc.docNo}`}
          rowClassName="hover:bg-[var(--color-canvas)]"
          empty={`No ${copy.title.toLowerCase()} for this filter`}
        />
      </Card>
    </>
  );
}

export async function OrderDocNewScreen({
  kind,
  orderHandle,
}: {
  kind: Kind;
  /** Opened from a Sales Order: its lines are offered ready to fill. */
  orderHandle?: string;
}) {
  const user = await requirePermission('bill:manage');
  const copy = COPY[kind];
  const [parties, allParties, choices, order] = await Promise.all([
    listParties({ role: copy.role }),
    listParties({}),
    orderLineChoices(),
    orderHandle ? findSalesOrder(orderHandle) : Promise.resolve(null),
  ]);

  // From an order, one line per order line this document can serve: yarn and
  // knitting for finished fabric, dyeing for anything.
  const seeded = (order?.lines ?? [])
    .filter((line) => kind === 'wo' || line.category === 'fabric')
    .map((line) => ({
      id: '',
      orderLineId: line.id,
      description: line.description,
      color: line.color ?? '',
      gsm: '',
      dia: '',
      quantityKg: plainKg(line.quantity),
      rate: '',
    }));

  return (
    <>
      <PageTitle
        title={`New ${copy.singular}`}
        subtitle={order ? `For Sales Order ${order.docNo}, ${order.partyName}` : undefined}
      />
      <OrderDocForm
        kind={kind}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        allParties={allParties.map((p) => ({ id: p.id, name: p.name }))}
        orderLines={choices}
        action={saveOrderDocAction}
        submitLabel={`Save ${copy.singular}`}
        cancelHref={order ? `/orders/${order.docNo}` : copy.base}
        canCreateParty={can(user.role, 'party:manage')}
        values={{
          partyId: '',
          process: 'knitting',
          orderDate: todayInDhaka(),
          deliverToId: '',
          deliveryBy: '',
          terms: '',
          notes: '',
          lines: seeded,
        }}
      />
    </>
  );
}

export async function OrderDocEditScreen({ kind, handle }: { kind: Kind; handle: string }) {
  const user = await requirePermission('bill:manage');
  const copy = COPY[kind];
  const [doc, parties, allParties, choices] = await Promise.all([
    findDoc(kind, handle),
    listParties({ role: copy.role, includeInactive: true }),
    listParties({ includeInactive: true }),
    orderLineChoices(),
  ]);
  if (!doc) notFound();
  if (doc.status !== 'open') redirect(`${copy.base}/${doc.docNo}`);
  const wo = kind === 'wo' ? (doc as WorkOrder) : null;

  return (
    <>
      <PageTitle title={`Edit ${copy.singular} ${doc.docNo}`} />
      <OrderDocForm
        kind={kind}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        allParties={allParties.map((p) => ({ id: p.id, name: p.name }))}
        orderLines={choices}
        action={saveOrderDocAction}
        submitLabel="Save Changes"
        cancelHref={`${copy.base}/${doc.docNo}`}
        docId={doc.id}
        docNo={doc.docNo}
        canCreateParty={can(user.role, 'party:manage')}
        values={{
          partyId: doc.partyId,
          process: wo?.process ?? 'knitting',
          orderDate: doc.orderDate,
          deliverToId: doc.deliverToId ?? '',
          deliveryBy: doc.deliveryBy ?? '',
          terms: doc.terms ?? '',
          notes: doc.notes ?? '',
          lines: linesOf(doc, kind).map((line) => ({
            id: line.id,
            orderLineId: line.orderLineId,
            description: line.description,
            color: line.color ?? '',
            gsm: line.gsm ?? '',
            dia: line.dia ?? '',
            quantityKg: plainKg(line.quantityKg),
            rate: formatRate(line.rate),
          })),
        }}
      />
    </>
  );
}

export async function OrderDocScreen({ kind, handle }: { kind: Kind; handle: string }) {
  const user = await requirePermission('bill:read');
  const copy = COPY[kind];
  const doc = await findDoc(kind, handle);
  if (!doc) notFound();
  if (isUuid(handle)) permanentRedirect(`${copy.base}/${doc.docNo}`);
  const wo = kind === 'wo' ? (doc as WorkOrder) : null;
  const mayEdit = can(user.role, 'bill:manage');
  const choices = await listOrderLineOptions();
  const orderLine = new Map(choices.map((c) => [c.id, c]));

  return (
    <>
      <div className="mb-4 md:pt-5">
        <LinkButton href={copy.base} variant="secondary" icon="back">
          Back to {copy.title}
        </LinkButton>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {copy.singular} {doc.docNo} <StatusTag status={doc.status} />
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {[
              doc.partyName,
              wo ? workProcessLabel(wo.process) : 'Yarn',
              formatDate(doc.orderDate),
              doc.deliveryBy ? `Delivery by ${formatDate(doc.deliveryBy)}` : null,
              `Deliver to ${doc.deliverToName ?? 'our store'}`,
            ]
              .filter(Boolean)
              .join('  |  ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadButton href={`${copy.base}/${doc.docNo}/pdf`}>Download PDF</DownloadButton>
          {mayEdit && doc.status === 'open' ? (
            <LinkButton href={`${copy.base}/${doc.docNo}/edit`} variant="secondary" icon="edit">
              Edit
            </LinkButton>
          ) : null}
          {mayEdit ? (
            <StatusBox action={setOrderDocStatusAction} id={doc.id} status={doc.status} kind={kind} />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader title="Lines" />
        <Table>
          <thead>
            <tr>
              <Th className="w-8">No</Th>
              <Th>Description</Th>
              <Th>For Order</Th>
              {wo ? <Th>Color, GSM, Dia</Th> : null}
              <Th numeric>{wo ? 'Grey kg' : 'Yarn kg'}</Th>
              <Th numeric>Rate</Th>
              <Th numeric>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {linesOf(doc, kind).map((line) => {
              const target = orderLine.get(line.orderLineId);
              return (
                <tr key={line.id}>
                  <Td className="text-[var(--color-muted)]">{line.lineNo}</Td>
                  <Td>{line.description}</Td>
                  <Td>
                    <Link href={`/orders/${line.orderDocNo}`} className="text-[var(--color-navy)] hover:underline">
                      {line.orderDocNo} / {line.orderLineNo}
                    </Link>
                    {target ? (
                      <div className="text-xs text-[var(--color-muted)]">
                        {[target.partyName, target.customerRef, orderCategoryLabel(target.category)]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    ) : null}
                  </Td>
                  {wo ? (
                    <Td>{[line.color, line.gsm, line.dia].filter(Boolean).join(', ')}</Td>
                  ) : null}
                  <Td numeric>{line.quantityKg}</Td>
                  <Td numeric>{formatRate(line.rate)}</Td>
                  <Td numeric>{formatTaka(line.amount)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-canvas)] font-semibold">
              <Td colSpan={wo ? 6 : 5}>Total</Td>
              <Td numeric>{formatTaka(doc.total)}</Td>
            </tr>
          </tfoot>
        </Table>
      </Card>
      {doc.terms || doc.notes ? (
        <Card className="mt-4 space-y-2 p-4 text-sm whitespace-pre-line">
          {doc.terms ? (
            <div>
              <span className="font-medium">Terms: </span>
              {doc.terms}
            </div>
          ) : null}
          {doc.notes ? (
            <div>
              <span className="font-medium">Remarks: </span>
              {doc.notes}
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
