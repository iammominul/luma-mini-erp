import { notFound, permanentRedirect } from 'next/navigation';
import { DeleteBox } from '@/components/DeleteBox';
import {
  Card,
  CardHeader,
  DownloadButton,
  LinkButton,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { amountInWords, formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { findPayment, getParty } from '@/lib/queries';
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

  const payment = await findPayment(id);
  // The role, not the direction: a payment to a supplier and one to a
  // subcontractor both go out, and each belongs under its own lens only.
  if (!payment || payment.partyRole !== copy.role) notFound();

  // One voucher, one address: its MR or PV number.
  if (isUuid(id) && payment.docNo) {
    permanentRedirect(`/${side}/settlements/${payment.docNo}`);
  }
  const handle = payment.docNo ?? payment.id;

  const party = await getParty(payment.partyId);
  if (!party) notFound();

  const rows = [
    { label: copy.partyWord, value: party.name },
    { label: 'Date', value: formatDate(payment.paidOn) },
    { label: 'Mode', value: paymentModeLabel(payment.mode) },
    { label: 'Paper Ref / Cheque', value: payment.reference ?? '' },
    { label: 'Narration', value: payment.narration ?? '' },
    { label: 'Notes', value: payment.notes ?? '' },
  ].filter((row) => row.value !== '');

  return (
    <>
      {/* The work area keeps no top padding, so a screen without a PageTitle
          sets its own. See the comment on main in AppShell.tsx. */}
      <div className="mb-4 md:pt-5">
        <LinkButton
          href={`/${side}/settlements`}
          variant="secondary"
          icon="back"
        >
          Back to {copy.settlementTitle}
        </LinkButton>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {copy.settlementSingular} {payment.docNo ?? ''}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {party.name} | {formatDate(payment.paidOn)} |{' '}
            {paymentModeLabel(payment.mode)} | {formatTaka(payment.amount)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadButton href={`/${side}/settlements/${handle}/pdf`}>
            Download PDF
          </DownloadButton>
          <LinkButton
            href={`/${side}/settlements/${handle}/edit`}
            variant="secondary"
            icon="edit"
          >
            Edit
          </LinkButton>
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
                <Th className="w-32 md:w-48">{row.label}</Th>
                <Td>{row.value}</Td>
              </tr>
            ))}
            <tr>
              <Th className="w-32 md:w-48">{copy.settlementColumn}</Th>
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
