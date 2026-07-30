import { notFound } from 'next/navigation';
import { PartyForm } from '@/components/PartyForm';
import { Card, PageTitle } from '@/components/ui';
import { getParty } from '@/lib/queries';
import { partyTypeLabel } from '@/lib/types';
import { updatePartyAction } from '../actions';

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const party = await getParty(id);
  if (!party) notFound();

  return (
    <>
      <PageTitle
        title={party.name}
        subtitle={`${partyTypeLabel(party.type)}. Changing an opening balance changes every statement, so it is recorded in the activity log.`}
      />

      <Card className="p-4">
        <PartyForm
          action={updatePartyAction}
          submitLabel="Save Changes"
          cancelHref="/parties"
          partyId={party.id}
          lockType
          values={{
            name: party.name,
            type: party.type,
            contactPerson: party.contactPerson ?? '',
            phone: party.phone ?? '',
            address: party.address ?? '',
            openingBalance: party.openingBalance.toDecimalString(),
            openingAsOf: party.openingAsOf ?? '',
          }}
        />
      </Card>
    </>
  );
}
