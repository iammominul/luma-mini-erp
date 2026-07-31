import { notFound } from 'next/navigation';
import { BillForm } from '@/components/BillForm';
import { PageTitle } from '@/components/ui';
import { getBill, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { updateBillAction } from '../../actions';

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [bill, parties] = await Promise.all([
    getBill(id),
    listParties({ role: copy.role, includeInactive: true }),
  ]);
  if (!bill || bill.direction !== copy.billDirection) notFound();

  return (
    <>
      <PageTitle
        title={`Edit ${copy.billSingular} ${bill.billNo}`}
        subtitle="The old and new values are both kept in the activity log."
      />
      <BillForm
        copy={copy}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        action={updateBillAction}
        submitLabel="Save Changes"
        cancelHref={`/${side}/bills/${bill.id}`}
        requireReason
        billId={bill.id}
        values={{
          partyId: bill.partyId,
          status: bill.status,
          natureOfWork: bill.natureOfWork,
          narration: bill.narration ?? '',
          billNo: bill.billNo,
          bookNo: bill.bookNo ?? '',
          billDate: bill.billDate,
          reference: bill.reference ?? '',
          notes: bill.notes ?? '',
          lines: bill.lines.map((line) => ({
            description: line.description,
            fabricType: line.fabricType ?? '',
            color: line.color ?? '',
            challanNo: line.challanNo ?? '',
            orderNo: line.orderNo ?? '',
            greyKg: line.greyKg,
            finishedKg: line.finishedKg ?? '',
            rate: line.rate,
          })),
        }}
      />
    </>
  );
}
