import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amountInWords, formatTaka } from '@/lib/format';
import { DeleteBox } from '@/components/DeleteBox';
import { Letterhead, SignatureBlock } from '@/components/Letterhead';
import { PrintButton } from '@/components/PrintButton';
import { Card, Table, Td, Th } from '@/components/ui';
import { formatQtyKg, parseQtyKg, sumGrams } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { getBill } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { deleteBillAction } from '../actions';

export default async function BillPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const bill = await getBill(id);
  if (!bill || bill.partyType !== side) notFound();

  const totalGrams = sumGrams(bill.lines.map((line) => parseQtyKg(line.qtyKg)));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/${side}/bills`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Back to {copy.billTitle}
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton />
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

      <Card className="mx-auto max-w-4xl p-8 print:max-w-none print:border-0 print:p-0">
        <Letterhead
          documentTitle={copy.billSingular}
          meta={[
            { label: 'Bill No', value: bill.billNo },
            { label: 'Date', value: formatDate(bill.billDate) },
            ...(bill.reference
              ? [{ label: 'Reference', value: bill.reference }]
              : []),
          ]}
        />

        <div className="mt-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {copy.billNoIsOurs ? 'Billed To' : 'Received From'}
          </div>
          <div className="font-semibold">{bill.party.name}</div>
          {bill.party.address ? <div>{bill.party.address}</div> : null}
          {bill.party.phone ? <div>Phone: {bill.party.phone}</div> : null}
        </div>

        <div className="mt-4 border border-[var(--color-line)]">
          <Table>
            <thead>
              <tr>
                <Th className="w-12">No</Th>
                <Th>Description</Th>
                <Th numeric>Weight (kg)</Th>
                <Th numeric>Rate per kg</Th>
                <Th numeric>Amount (Tk)</Th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((line) => (
                <tr key={line.id}>
                  <Td>{line.lineNo}</Td>
                  <Td>{line.description}</Td>
                  <Td numeric>{line.qtyKg}</Td>
                  <Td numeric>{line.rate}</Td>
                  <Td numeric>{formatTaka(line.amount)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--color-canvas)] font-semibold">
                <Td colSpan={2}>Total</Td>
                <Td numeric>{formatQtyKg(totalGrams)}</Td>
                <Td />
                <Td numeric>{formatTaka(bill.total)}</Td>
              </tr>
            </tfoot>
          </Table>
        </div>

        <div className="mt-3 text-sm">
          <span className="font-medium">In Words: </span>
          {amountInWords(bill.total)}
        </div>

        {bill.notes ? (
          <div className="mt-3 text-sm">
            <span className="font-medium">Notes: </span>
            {bill.notes}
          </div>
        ) : null}

        <SignatureBlock
          left="Prepared By"
          right={copy.billNoIsOurs ? 'Authorized Signature' : 'Verified By'}
        />
      </Card>
    </>
  );
}
