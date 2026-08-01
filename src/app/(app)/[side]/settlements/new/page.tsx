import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PaymentForm } from '@/components/PaymentForm';
import { Notice, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { createPaymentAction } from '../actions';

export default async function NewSettlementPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string }>;
  searchParams: Promise<{ party?: string }>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const { party } = await searchParams;
  const parties = await listParties({ role: copy.role });

  return (
    <>
      <PageTitle
        title={`New ${copy.settlementSingular}`}
        subtitle={`Money ${copy.role === 'customer' ? 'received from a customer' : 'paid to a subcontractor'}, against the running balance.`}
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
        <PaymentForm
          copy={copy}
          parties={parties.map((p) => ({ id: p.id, name: p.name }))}
          action={createPaymentAction}
          submitLabel={`Save ${copy.settlementSingular}`}
          cancelHref={`/${side}/settlements`}
          values={{
            partyId: party ?? '',
            narration: '',
            paidOn: todayInDhaka(),
            amount: '',
            mode: 'cash',
            reference: '',
            notes: '',
          }}
        />
      )}
    </>
  );
}
