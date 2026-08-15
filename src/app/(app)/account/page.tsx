import { PageTitle } from '@/components/ui';
import { roleDescription, roleLabel } from '@/lib/permissions';
import { getUser } from '@/lib/queries';
import { requireUser } from '@/lib/session';
import { AccountForms } from './AccountForms';

/**
 * Your own account. Every role reaches this, which is the point of it: without
 * it an Accounts or Viewer user cannot change their own password at all and has
 * to ask an Owner, who then knows a password that opens their account.
 */
export default async function AccountPage() {
  const me = await requireUser();
  const account = await getUser(me.id);

  return (
    <>
      <PageTitle
        title="My Account"
        subtitle="Your name, your sign-in email, and your password."
      />
      <AccountForms
        name={me.name}
        email={me.email}
        role={roleLabel(me.role)}
        roleNote={roleDescription(me.role)}
        lastSignedInAt={account?.lastSignedInAt ?? null}
      />
    </>
  );
}
