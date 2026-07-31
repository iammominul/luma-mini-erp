import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amountInWords, formatTaka } from '@/lib/format';
import { DeleteBox } from '@/components/DeleteBox';
import {
  Card,
  CardHeader,
  DownloadButton,
  Notice,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatQtyKg, parseQtyKg, sumGrams } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { getBill } from '@/lib/queries';
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
  const bill = await getBill(id);
  if (!bill || bill.direction !== copy.billDirection) notFound();

  const totalGrey = sumGrams(bill.lines.map((l) => parseQtyKg(l.greyKg)));
  const totalFinished = sumGrams(
    bill.lines.map((l) => (l.finishedKg ? parseQtyKg(l.finishedKg) : 0n)),
  );

  const isDraft = bill.status === 'draft';
  const meta = [
    bill.party.name,
    formatDate(bill.billDate),
    ...(bill.bookNo ? [`Book ${bill.bookNo}`] : []),
    ...(bill.docNo ? [`Our Ref ${bill.docNo}`] : []),
    ...(bill.reference ? [bill.reference] : []),
  ];

  return (
    <>
      <div className="mb-4">
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
        <div className="flex items-center gap-2">
          {isDraft ? (
            <PostBillBox action={postBillAction} id={bill.id} side={side} />
          ) : null}
          <DownloadButton href={`/${side}/bills/${bill.id}/pdf`}>
            Download PDF
          </DownloadButton>
          <Link
            href={`/${side}/bills/${bill.id}/edit`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Edit
          </Link>
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
        <CardHeader title="Bill Lines" />
        <Table>
          <thead>
            <tr>
              <Th className="w-10">SL</Th>
              <Th>Particulars</Th>
              <Th className="w-24">Fabric Type</Th>
              <Th className="w-24">Color</Th>
              <Th className="w-24">Challan No</Th>
              <Th className="w-24">Order No</Th>
              <Th numeric className="w-28">
                F/Weight kg
              </Th>
              <Th numeric className="w-28">
                G/Weight kg
              </Th>
              <Th numeric className="w-24">
                Rate per kg
              </Th>
              <Th numeric className="w-32">
                Amount Tk
              </Th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((line) => (
              <tr key={line.id}>
                <Td className="text-[var(--color-muted)]">{line.lineNo}</Td>
                <Td>{line.description}</Td>
                <Td>{line.fabricType ?? ''}</Td>
                <Td>{line.color ?? ''}</Td>
                <Td>{line.challanNo ?? ''}</Td>
                <Td>{line.orderNo ?? ''}</Td>
                <Td numeric>{line.finishedKg ?? ''}</Td>
                <Td numeric>{line.greyKg}</Td>
                <Td numeric>{line.rate}</Td>
                <Td numeric>{formatTaka(line.amount)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-canvas)] font-semibold">
              <Td colSpan={6}>Total</Td>
              <Td numeric>
                {totalFinished > 0n ? formatQtyKg(totalFinished) : ''}
              </Td>
              <Td numeric>{formatQtyKg(totalGrey)}</Td>
              <Td />
              <Td numeric>{formatTaka(bill.total)}</Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card className="mt-4 p-4 text-sm">
        <div>
          <span className="font-medium">In Words (BDT): </span>
          {amountInWords(bill.total)}
        </div>
        {bill.notes ? (
          <div className="mt-2">
            <span className="font-medium">Notes: </span>
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
