import { notFound } from 'next/navigation';
import { DeleteBox } from '@/components/DeleteBox';
import { PaymentForm } from '@/components/PaymentForm';
import { PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { getPayment, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { deletePaymentAction, updatePaymentAction } from '../../actions';

export default async function EditSettlementPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [payment, parties] = await Promise.all([
    getPayment(id),
    listParties({ type: side, includeInactive: true }),
  ]);
  if (!payment || payment.partyType !== side) notFound();

  return (
    <>
      <PageTitle
        title={`Edit ${copy.settlementSingular}`}
        subtitle={`${payment.partyName}, ${formatDate(payment.paidOn)}. The old and new values are both kept in the activity log.`}
      />

      <PaymentForm
        copy={copy}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        action={updatePaymentAction}
        submitLabel="Save Changes"
        cancelHref={`/${side}/settlements`}
        requireReason
        paymentId={payment.id}
        values={{
          partyId: payment.partyId,
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
