import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { amountInWords, formatTaka } from '@/lib/format';
import { DeleteBox } from '@/components/DeleteBox';
import { DataTable } from '@/components/DataTable';
import {
  CancelLink,
  Card,
  CardHeader,
  DownloadButton,
  Notice,
} from '@/components/ui';
import { formatQtyKg, formatRate, parseQtyKg, sumGrams } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { isUuid } from '@/lib/ids';
import { findBill } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { PostBillBox } from '@/components/PostBillBox';
import { deleteBillAction, postBillAction } from '../actions';

export default async function BillPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const bill = await findBill(id);
  if (!bill || bill.direction !== copy.billDirection) notFound();

  // One bill, one address, where the bill has a number of its own to be known
  // by. A bill received keeps its id, because the subcontractor's paper number
  // is unique only to that subcontractor and cannot name a bill on its own.
  if (isUuid(id) && bill.docNo) {
    permanentRedirect(`/${side}/bills/${bill.docNo}`);
  }

  const handle = bill.docNo ?? bill.id;

  const totalGrey = sumGrams(bill.lines.map((l) => parseQtyKg(l.greyKg)));
  const totalFinished = sumGrams(
    bill.lines.map((l) => (l.finishedKg ? parseQtyKg(l.finishedKg) : 0n)),
  );

  const isDraft = bill.status === 'draft';
  const meta = [
    bill.party.name,
    formatDate(bill.billDate),
    ...(bill.docNo ? [`System Bill No ${bill.docNo}`] : []),
  ];

  return (
    <>
      {/* The work area keeps no top padding, so a screen without a PageTitle
          sets its own. See the comment on main in AppShell.tsx. */}
      <div className="mb-4 md:pt-5">
        <Link
          href={`/${side}/bills`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Back to {copy.billTitle}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {copy.billSingular} {bill.billNo}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {meta.join('  |  ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <PostBillBox action={postBillAction} id={bill.id} side={side} />
          ) : null}
          <DownloadButton href={`/${side}/bills/${handle}/pdf`}>
            Download PDF
          </DownloadButton>
          <CancelLink href={`/${side}/bills/${handle}/edit`}>Edit</CancelLink>
          <DeleteBox
            action={deleteBillAction}
            id={bill.id}
            side={side}
            title="Remove Bill"
            confirmLabel="Remove This Bill"
          />
        </div>
      </div>

      {isDraft ? (
        <Notice>
          This bill is a draft. It is not counted in any balance and does not
          appear on a statement until it is posted, and it takes its number then.
        </Notice>
      ) : null}

      <Card className={isDraft ? 'mt-4' : ''}>
        <CardHeader title="Items" />
        <DataTable
          columns={[
            {
              key: 'sl',
              head: 'SL',
              headClassName: 'w-10',
              cellClassName: 'text-[var(--color-muted)]',
              // Leads the particulars rather than taking a line of its own.
              phone: 'title',
              phoneClassName: 'text-[var(--color-muted)]',
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
              cell: (line) => line.orderNo ?? '',
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
              head: 'G/Weight kg',
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
              phoneClassName: 'text-xs text-[var(--color-muted)]',
              cell: (line) =>
                [
                  line.color,
                  line.lotNo ? `LOT ${line.lotNo}` : null,
                  line.challanNo ? `Challan ${line.challanNo}` : null,
                  line.orderNo ? `Order ${line.orderNo}` : null,
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
          ]}
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
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Download the PDF for the letterhead copy with the signature block.
        </p>
      </Card>
    </>
  );
}
