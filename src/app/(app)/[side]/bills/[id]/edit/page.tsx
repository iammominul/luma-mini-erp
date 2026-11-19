import { notFound } from 'next/navigation';
import { BillForm } from '@/components/BillForm';
import { PageTitle } from '@/components/ui';
import { formatRate } from '@/lib/amount';
import { findBill, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { billHandle } from '@/lib/types';
import { checkBillNoAction, updateBillAction } from '../../actions';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/permissions';
import { billLinkOptions } from '../../link-options';

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ side: string; id: string }>;
}) {
  const user = await requirePermission('bill:manage');
  const { side, id } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [bill, parties, linkOptions] = await Promise.all([
    findBill(id),
    listParties({ role: copy.role, includeInactive: true }),
    billLinkOptions(copy.role),
  ]);
  if (!bill || bill.partyRole !== copy.role) notFound();

  return (
    <>
      <PageTitle title={`Edit ${copy.billSingular} ${billHandle(bill)}`} />
      <BillForm
        copy={copy}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        action={updateBillAction}
        submitLabel="Save Changes"
        cancelHref={`/${side}/bills/${bill.docNo ?? bill.id}`}
        requireReason
        billId={bill.id}
        docNo={bill.docNo}
        checkBillNo={checkBillNoAction}
        linkOptions={linkOptions}
        canCreateParty={can(user.role, 'party:manage')}
        values={{
          partyId: bill.partyId,
          status: bill.status,
          natureOfWork: bill.natureOfWork,
          narration: bill.narration ?? '',
          billNo: bill.billNo ?? '',
          billDate: bill.billDate,
          notes: bill.notes ?? '',
          lines: bill.lines.map((line) => ({
            linkId:
              (bill.partyRole === 'customer'
                ? line.orderLineId
                : line.sourceLineId) ?? '',
            description: line.description,
            color: line.color ?? '',
            challanNo: line.challanNo ?? '',
            orderNo: line.orderNo ?? '',
            lotNo: line.lotNo ?? '',
            greyKg: line.greyKg,
            finishedKg: line.finishedKg ?? '',
            // NUMERIC(12,6) hands back "30.000000", which is not what anyone
            // typed and not what they should be asked to edit.
            rate: formatRate(line.rate),
          })),
        }}
      />
    </>
  );
}
