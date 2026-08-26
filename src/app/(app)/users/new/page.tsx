import { PageTitle } from '@/components/ui';
import { requirePermission } from '@/lib/session';
import { UserForm } from '../UserForm';

export default async function NewUserPage() {
  await requirePermission('user:manage');

  return (
    <>
      <PageTitle
        title="New User"
        subtitle="No email is sent. Give the password to the person directly."
      />
      <UserForm />
    </>
  );
}
