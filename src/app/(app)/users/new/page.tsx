import { PageTitle } from '@/components/ui';
import { requirePermission } from '@/lib/session';
import { UserForm } from '../UserForm';

export default async function NewUserPage() {
  await requirePermission('user:manage');

  return (
    <>
      <PageTitle
        title="New User"
        subtitle="Set the password here and give it to the person directly. There is no email from this app."
      />
      <UserForm />
    </>
  );
}
