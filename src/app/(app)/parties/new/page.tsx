import { PartyForm } from '@/components/PartyForm';
import { Card, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { createPartyAction } from '../actions';

/**
 * Adding a party is its own screen, the same as every other record in the app.
 *
 * It used to be a card sitting open above the list, so /parties opened on a
 * blank form and the parties themselves started below it. A register opens on
 * the register.
 */
export default function NewPartyPage() {
  return (
    <>
      <PageTitle
        title="Add Party"
        subtitle="Customers send grey fabric and owe us. Subcontractors dye it and we owe them. A party can be both."
      />

      <Card className="p-4">
        <PartyForm
          action={createPartyAction}
          submitLabel="Add Party"
          cancelHref="/parties"
          values={{
            name: '',
            code: '',
            roles: ['customer'],
            contactPerson: '',
            phone: '',
            address: '',
            openingBalance: '0.00',
            openingAsOf: todayInDhaka(),
          }}
        />
      </Card>
    </>
  );
}
