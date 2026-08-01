import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteBox } from '@/components/DeleteBox';
import {
  Card,
  CardHeader,
  DownloadButton,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { amountInWords, formatTaka } from '@/lib/format';
import { getParty, getPayment } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { paymentModeLabel } from '@/lib/types';
import { deletePaymentAction } from '../actions';

/**
 * One settlement, on its own page.
 *
 * A bill has had a record view since the beginning and a settlement had only an
 * edit form, which meant the way to read a receipt was to open the form that
 * changes it. That is the wrong door: reading is the common act and editing the
 * rare one.
 */
export default async function SettlementPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const payment = await getPayment(id);
  if (!payment || payment.direction !== copy.paymentDirection) notFound();

  const party = await getParty(payment.partyId);
  if (!party) notFound();

  const rows = [
    { label: copy.partyWord, value: party.name },
    { label: 'Date', value: formatDate(payment.paidOn) },
    { label: 'Mode', value: paymentModeLabel(payment.mode) },
    { label: 'Reference', value: payment.reference ?? '' },
    { label: 'Narration', value: payment.narration ?? '' },
    { label: 'Notes', value: payment.notes ?? '' },
  ].filter((row) => row.value !== '');

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/${side}/settlements`}
          className="text-sm text-[var(--color-navy)] hover:underline"
        >
          Back to {copy.settlementTitle}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {copy.settlementSingular} {formatTaka(payment.amount)}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {party.name} | {formatDate(payment.paidOn)} |{' '}
            {paymentModeLabel(payment.mode)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton href={`/${side}/settlements/${payment.id}/pdf`}>
            Download PDF
          </DownloadButton>
          <Link
            href={`/${side}/settlements/${payment.id}/edit`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Edit
          </Link>
          <DeleteBox
            action={deletePaymentAction}
            id={payment.id}
            side={side}
            title={`Remove ${copy.settlementSingular}`}
            confirmLabel={`Remove This ${copy.settlementSingular}`}
          />
        </div>
      </div>

      <Card>
        <CardHeader title={`${copy.settlementSingular} Details`} />
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <Th className="w-48">{row.label}</Th>
                <Td>{row.value}</Td>
              </tr>
            ))}
            <tr>
              <Th className="w-48">{copy.settlementColumn}</Th>
              <Td className="font-semibold">{formatTaka(payment.amount)}</Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card className="mt-4 p-4 text-sm">
        <div>
          <span className="font-medium">In Words (BDT): </span>
          {amountInWords(payment.amount)}
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Download the PDF for the letterhead copy with the signature block.
        </p>
      </Card>
    </>
  );
}
