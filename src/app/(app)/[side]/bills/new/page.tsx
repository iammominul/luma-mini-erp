import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BillForm } from '@/components/BillForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listParties, nextCustomerBillSerial } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { checkBillNoAction, createBillAction } from '../actions';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/permissions';
import { billLinkOptions } from '../link-options';

export default async function NewBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string }>;
  searchParams: Promise<{ party?: string }>;
}) {
  const user = await requirePermission('bill:manage');
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const { party } = await searchParams;
  const [parties, nextSerial, linkOptions] = await Promise.all([
    listParties({ role: copy.role }),
    // Only the customer side previews its number: a BR number is issued on
    // save and never printed, so there is nothing to preview.
    copy.billNoIsOurs ? nextCustomerBillSerial() : Promise.resolve(null),
    billLinkOptions(copy.role),
  ]);
  const canCreateParty = can(user.role, 'party:manage');

  return (
    <>
      <PageTitle title={`New ${copy.billSingular}`} />

      {parties.length === 0 && !canCreateParty ? (
        <Notice tone="error">
          There are no active {copy.partyPlural.toLowerCase()} yet.{' '}
          <Link href="/parties" className="underline">
            Add one on the Parties page
          </Link>{' '}
          first.
        </Notice>
      ) : (
        <BillForm
          copy={copy}
          parties={parties.map((p) => ({ id: p.id, name: p.name }))}
          action={createBillAction}
          submitLabel={`Save ${copy.billSingular}`}
          cancelHref={`/${side}/bills`}
          nextSerial={nextSerial}
          checkBillNo={checkBillNoAction}
          linkOptions={linkOptions}
          canCreateParty={canCreateParty}
          values={{
            partyId: party ?? '',
            status: 'posted',
            natureOfWork: 'dyeing_finishing',
            narration: '',
            billNo: '',
            billDate: todayInDhaka(),
            notes: '',
            lines: [],
          }}
        />
      )}
    </>
  );
}
