import { notFound } from 'next/navigation';
import { DeleteBox } from '@/components/DeleteBox';
import { PaymentForm } from '@/components/PaymentForm';
import { PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { findPayment, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { deletePaymentAction, updatePaymentAction } from '../../actions';
import { requirePermission } from '@/lib/session';

export default async function EditSettlementPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  await requirePermission('settlement:manage');
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [payment, parties] = await Promise.all([
    findPayment(id),
    listParties({ role: copy.role, includeInactive: true }),
  ]);
  if (!payment || payment.partyRole !== copy.role) notFound();

  return (
    <>
      <PageTitle
        title={`Edit ${copy.settlementSingular} ${payment.docNo ?? ''}`.trim()}
        subtitle={`${payment.partyName}, ${formatDate(payment.paidOn)}`}
      />

      <PaymentForm
        copy={copy}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        action={updatePaymentAction}
        submitLabel="Save Changes"
        cancelHref={`/${side}/settlements/${payment.docNo ?? payment.id}`}
        requireReason
        paymentId={payment.id}
        values={{
          partyId: payment.partyId,
          narration: payment.narration ?? '',
          paidOn: payment.paidOn,
          amount: payment.amount.toDecimalString(),
          mode: payment.mode,
          reference: payment.reference ?? '',
          notes: payment.notes ?? '',
        }}
      />

      <div className="mt-6 max-w-3xl">
        <DeleteBox
          action={deletePaymentAction}
          id={payment.id}
          side={side}
          title={`Remove This ${copy.settlementSingular}`}
          confirmLabel="Remove Entry"
        />
      </div>
    </>
  );
}
