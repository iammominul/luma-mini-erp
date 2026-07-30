import Link from 'next/link';
import { formatTaka } from '@/lib/format';
import { PartyForm } from '@/components/PartyForm';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { listParties } from '@/lib/queries';
import { partyTypeLabel } from '@/lib/types';
import { createPartyAction, togglePartyActiveAction } from './actions';

export default async function PartiesPage() {
  const parties = await listParties({ includeInactive: true });

  return (
    <>
      <PageTitle
        title="Parties"
        subtitle="Customers send grey fabric and owe us. Subcontractors dye it and we owe them."
      />

      <Card className="mb-4">
        <CardHeader title="Add a Party" />
        <div className="p-4">
          <PartyForm
            action={createPartyAction}
            submitLabel="Add Party"
            values={{
              name: '',
              type: 'customer',
              contactPerson: '',
              phone: '',
              address: '',
              openingBalance: '0.00',
              openingAsOf: todayInDhaka(),
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={`All Parties (${parties.length})`} />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Contact</Th>
              <Th>Phone</Th>
              <Th numeric>Opening Balance</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 ? (
              <EmptyRow columns={7}>No parties yet</EmptyRow>
            ) : (
              parties.map((party) => (
                <tr key={party.id}>
                  <Td>
                    <Link
                      href={`/parties/${party.id}`}
                      className="font-medium text-[var(--color-navy)] hover:underline"
                    >
                      {party.name}
                    </Link>
                  </Td>
                  <Td>{partyTypeLabel(party.type)}</Td>
                  <Td>{party.contactPerson ?? ''}</Td>
                  <Td>{party.phone ?? ''}</Td>
                  <Td numeric>{formatTaka(party.openingBalance)}</Td>
                  <Td>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        party.active
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-[var(--color-muted)]'
                      }`}
                    >
                      {party.active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/${party.type}/statement/${party.id}`}
                        className="text-sm text-[var(--color-navy)] hover:underline"
                      >
                        Statement
                      </Link>
                      <form action={togglePartyActiveAction}>
                        <input type="hidden" name="id" value={party.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(!party.active)}
                        />
                        <button className="text-sm text-[var(--color-muted)] hover:underline">
                          {party.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
