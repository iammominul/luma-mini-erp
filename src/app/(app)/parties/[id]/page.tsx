import { notFound } from 'next/navigation';
import { PartyForm } from '@/components/PartyForm';
import { Card, PageTitle } from '@/components/ui';
import { getParty } from '@/lib/queries';
import { rolesLabel, rolesOf } from '@/lib/types';
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
        subtitle={`${rolesLabel(party.roles)}. Changing an opening balance changes every statement, so it is recorded in the activity log.`}
      />

      <Card className="p-4">
        <PartyForm
          action={updatePartyAction}
          submitLabel="Save Changes"
          cancelHref="/parties"
          partyId={party.id}
            values={{
            name: party.name,
            code: party.code ?? '',
            roles: rolesOf(party.roles),
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
