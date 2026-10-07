import { notFound, permanentRedirect } from 'next/navigation';
import { amountInWords, formatTaka } from '@/lib/format';
import { DeleteBox } from '@/components/DeleteBox';
import { type Column, DataTable } from '@/components/DataTable';
import {
  Card,
  CardHeader,
  DownloadButton,
  LinkButton,
  Notice,
  DocLinks,
  RecordHead,
  Tag,
} from '@/components/ui';
import { formatQtyKg, formatRate, parseQtyKg, sumGrams } from '@/lib/amount';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { RecordPaymentDialog } from '@/components/RecordPaymentDialog';
import { can } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import { isUuid } from '@/lib/ids';
import { findBill } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { type BillLine, billHandle } from '@/lib/types';
import { PostBillBox } from '@/components/PostBillBox';
import { deleteBillAction, postBillAction } from '../actions';

export default async function BillPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const user = await requireUser();
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const bill = await findBill(id);
  // The role, not the direction: a supplier's bill and a subcontractor's bill
  // run the same way, and each belongs under its own lens only.
  if (!bill || bill.partyRole !== copy.role) notFound();

  // One bill, one address: its system number. Only a customer draft, which
  // has no number until it is posted, keeps its id.
  if (isUuid(id) && bill.docNo) {
    permanentRedirect(`/${side}/bills/${bill.docNo}`);
  }

  const handle = bill.docNo ?? bill.id;
  // A yarn bill has no color and no finished weight, and its weight is yarn.
  const isYarn = copy.role === 'supplier';

  const totalGrey = sumGrams(bill.lines.map((l) => parseQtyKg(l.greyKg)));
  const totalFinished = sumGrams(
    bill.lines.map((l) => (l.finishedKg ? parseQtyKg(l.finishedKg) : 0n)),
  );

  const isDraft = bill.status === 'draft';

  // The trail back through the order chain, read off the lines' own refs
  // ('SO-26-0001 / 2'), each document once.
  const docNos = (refs: (string | null)[]) => [
    ...new Set(
      refs.flatMap((ref) => (ref ? [ref.split(' / ')[0]!.trim()] : [])),
    ),
  ];
  const salesOrders = docNos(bill.lines.map((line) => line.orderRef));
  const sources = docNos(bill.lines.map((line) => line.sourceRef));
  const sourceHref = (docNo: string) =>
    docNo.startsWith('PO-')
      ? `/purchase-orders/${docNo}`
      : `/work-orders/${docNo}`;
  return (
    <>
      <RecordHead
        back={{ href: `/${side}/bills`, label: copy.billTitle }}
        kind={copy.billSingular}
        number={billHandle(bill)}
        tags={
          isDraft ? (
            <Tag tone="active">Draft</Tag>
          ) : bill.needsDetail ? (
            <Tag tone="warn">Needs Detail</Tag>
          ) : (
            <Tag tone="done">Posted</Tag>
          )
        }
        facts={[
          { label: copy.partyWord, value: bill.party.name },
          { label: 'Date', value: formatDate(bill.billDate) },
          ...(bill.billNo
            ? [
                {
                  label: copy.billNoIsOurs ? 'Paper Ref' : 'Their Bill No',
                  value: bill.billNo,
                },
              ]
            : []),
          ...(sources.length > 0
            ? [
                {
                  label: sources.every((no) => no.startsWith('PO-'))
                    ? 'Purchase Order'
                    : 'Work Order',
                  value: (
                    <DocLinks
                      links={sources.map((no) => ({
                        text: no,
                        href: sourceHref(no),
                      }))}
                    />
                  ),
                },
              ]
            : []),
          ...(salesOrders.length > 0
            ? [
                {
                  label: 'Sales Order',
                  value: (
                    <DocLinks
                      links={salesOrders.map((no) => ({
                        text: no,
                        href: `/orders/${no}`,
                      }))}
                    />
                  ),
                },
              ]
            : []),
        ]}
        figures={[
          {
            label: isYarn ? 'Yarn Kg' : 'Grey Kg',
            value: formatQtyKg(totalGrey),
          },
          ...(isYarn
            ? []
            : [{ label: 'Finished Kg', value: formatQtyKg(totalFinished) }]),
          { label: 'Bill Total', value: formatTaka(bill.total), strong: true },
        ]}
        actions={
          <>
            {isDraft ? (
              <PostBillBox action={postBillAction} id={bill.id} side={side} />
            ) : null}
            {!isDraft && can(user.role, 'settlement:manage') ? (
              <RecordPaymentDialog
                side={side}
                partyId={bill.partyId}
                partyName={bill.party.name}
                isReceipt={copy.paymentDirection === 'in'}
                returnTo={`/${side}/bills/${handle}`}
                today={todayInDhaka()}
                suggestedAmount={bill.total.toDecimalString()}
              />
            ) : null}
            <DownloadButton href={`/${side}/bills/${handle}/pdf`}>
              Download PDF
            </DownloadButton>
            <LinkButton
              href={`/${side}/bills/${handle}/edit`}
              variant="secondary"
              icon="edit"
            >
              Edit
            </LinkButton>
            <DeleteBox
              action={deleteBillAction}
              id={bill.id}
              side={side}
              title="Remove Bill"
              confirmLabel="Remove This Bill"
            />
          </>
        }
      />

      {isDraft ? (
        <Notice>
          This bill is a draft. It is not counted in any balance and does not
          appear on a statement until it is posted, and it takes its number then.
        </Notice>
      ) : null}

      <Card className={isDraft ? 'mt-4' : ''}>
        <CardHeader title="Items" />
        <DataTable
          columns={(
            [
            {
              key: 'sl',
              head: 'SL',
              headClassName: 'w-10',
              cellClassName: 'text-ink-3',
              // Leads the particulars rather than taking a line of its own.
              phone: 'title',
              phoneClassName: 'text-ink-3',
              cell: (line) => line.lineNo,
            },
            // The desktop keeps every column. A phone reads the same line as
            // the arithmetic it is, so the codes and the figures are composed
            // into two lines by the phone-only columns below.
            //
            // The order runs from what the line is (description) to what it
            // points at (order, challan, lot, color) to what it comes to
            // (weights, rate, amount), and the grey weight sits next to the
            // rate next to the amount so the arithmetic reads left to right.
            {
              key: 'description',
              head: 'Description',
              phone: 'title',
              cell: (line) => line.description,
            },
            {
              key: 'orderNo',
              head: 'Order No',
              headClassName: 'w-24',
              only: 'table',
              // The order it is tied to when it is, else the text as written.
              cell: (line) => line.orderRef ?? line.orderNo ?? '',
            },
            {
              key: 'challanNo',
              head: 'Challan No',
              headClassName: 'w-24',
              only: 'table',
              cell: (line) => line.challanNo ?? '',
            },
            {
              key: 'lotNo',
              head: 'LOT No',
              headClassName: 'w-24',
              only: 'table',
              cell: (line) => line.lotNo ?? '',
            },
            {
              key: 'color',
              head: 'Color',
              headClassName: 'w-24',
              only: 'table',
              cell: (line) => line.color ?? '',
            },
            {
              key: 'finishedKg',
              head: 'F/Weight kg',
              numeric: true,
              headClassName: 'w-28',
              only: 'table',
              cell: (line) => line.finishedKg ?? '',
            },
            {
              key: 'greyKg',
              head: isYarn ? 'Yarn kg' : 'G/Weight kg',
              numeric: true,
              headClassName: 'w-28',
              only: 'table',
              cell: (line) => line.greyKg,
            },
            {
              key: 'rate',
              head: 'Unit Rate',
              numeric: true,
              headClassName: 'w-24',
              only: 'table',
              cell: (line) => formatRate(line.rate),
            },
            {
              // The basis the amount was worked out on, as one line that
              // multiplies out. formatRate and not the raw value: a rate
              // carries six decimals and an ordinary 30.00 would read as
              // "30.000000" without it.
              key: 'basis',
              head: '',
              only: 'phone',
              phone: 'full',
              phoneClassName: 'text-sm',
              cell: (line) => `${line.greyKg} kg x ${formatRate(line.rate)}`,
            },
            {
              // Everything recorded about the line that is not its arithmetic.
              key: 'codes',
              head: '',
              only: 'phone',
              phone: 'full',
              phoneClassName: 'text-xs text-ink-3',
              cell: (line) =>
                [
                  line.color,
                  line.lotNo ? `LOT ${line.lotNo}` : null,
                  line.challanNo ? `Challan ${line.challanNo}` : null,
                  line.orderRef ?? line.orderNo
                    ? `Order ${line.orderRef ?? line.orderNo}`
                    : null,
                  line.finishedKg ? `F/Wt ${line.finishedKg}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
            },
            {
              key: 'amount',
              head: 'Amount Tk',
              numeric: true,
              headClassName: 'w-32',
              phone: 'amount',
              cell: (line) => formatTaka(line.amount),
            },
            ] as Column<BillLine>[]
          ).filter(
            (column) =>
              !isYarn ||
              (column.key !== 'color' && column.key !== 'finishedKg'),
          )}
          rows={bill.lines}
          rowKey={(line) => line.id}
          empty="This bill has no lines"
          total={{
            label: 'Total',
            cells: {
              greyKg: formatQtyKg(totalGrey),
              finishedKg: totalFinished > 0n ? formatQtyKg(totalFinished) : '',
              amount: formatTaka(bill.total),
            },
          }}
        />
      </Card>

      <Card className="mt-4 p-4 text-sm">
        <div>
          <span className="font-medium">In Words (BDT): </span>
          {amountInWords(bill.total)}
        </div>
        {bill.notes ? (
          // Remarks, the same word the printed bill uses for the same text.
          <div className="mt-2 whitespace-pre-line">
            <span className="font-medium">Remarks: </span>
            {bill.notes}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-ink-3">
          Download the PDF for the letterhead copy with the signature block.
        </p>
      </Card>
    </>
  );
}
