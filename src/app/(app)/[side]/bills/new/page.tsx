import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BillForm } from '@/components/BillForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listParties, nextCustomerBillSerial } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { checkBillNoAction, createBillAction } from '../actions';
import { requirePermission } from '@/lib/session';

export default async function NewBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string }>;
  searchParams: Promise<{ party?: string }>;
}) {
  await requirePermission('bill:manage');
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const { party } = await searchParams;
  const [parties, nextSerial] = await Promise.all([
    listParties({ role: copy.role }),
    // Only the customer side takes a system number, so only it has one to show.
    copy.billNoIsOurs ? nextCustomerBillSerial() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageTitle
        title={`New ${copy.billSingular}`}
        subtitle="Enter it as the paper bill reads. Rate per kg on the grey weight, and the total is computed rather than typed."
      />

      {parties.length === 0 ? (
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
