'use client';

import { useActionState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Notice,
  Select,
  TextInput,
} from '@/components/ui';
import { useKeptValues } from '@/components/use-kept-values';
import { ROLES, roleDescription, roleLabel, type Role } from '@/lib/permissions';
import type { AppUser } from '@/lib/types';
import {
  resetPasswordAction,
  setUserRoleAction,
  setUserStatusAction,
  updateUserAction,
  type UserFormState,
} from '../actions';

/**
 * Four forms, one page.
 *
 * Deliberately not one form with one Save. A password field sitting in the same
 * form as a name would have to mean "leave blank to keep the current one",
 * which cannot tell unchanged from cleared, and a password manager fills any
 * form that holds a password field, so an Owner correcting a spelling could
 * write their own saved password onto somebody else's account. Each form
 * carries its own submit and reports its own result, the same way the account
 * screen does.
 */
export function ManageUser({
  user,
  isSelf,
  lastActiveOwner,
}: {
  user: AppUser;
  isSelf: boolean;
  lastActiveOwner: boolean;
}) {
  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader title="Details" />
        <div className="p-4">
          <DetailsForm user={user} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Role" />
        <div className="p-4">
          <RoleForm user={user} locked={lastActiveOwner} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Password" />
        <div className="p-4">
          <PasswordForm user={user} isSelf={isSelf} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <div className="p-4">
          <StatusForm
            user={user}
            isSelf={isSelf}
            lastActiveOwner={lastActiveOwner}
          />
        </div>
      </Card>
    </div>
  );
}

function Result({ state }: { state: UserFormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.done) return <Notice>{state.done}</Notice>;
  return null;
}

function DetailsForm({ user }: { user: AppUser }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    updateUserAction,
    {},
  );
  const { values, set } = useKeptValues(
    { name: user.name, email: user.email },
    state,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <Field label="Full Name" hint="Printed on any payroll run they approve.">
        <TextInput
          name="name"
          required
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <Field
        label="Email"
        hint="What they sign in with. Changing it does not sign them out, and their password still works."
      >
        <TextInput
          name="email"
          type="email"
          required
          autoComplete="off"
          value={values.email}
          onChange={(event) => set({ email: event.target.value })}
        />
      </Field>
      <Result state={state} />
      <Button type="submit" icon="check" disabled={pending}>
        {pending ? 'Saving' : 'Save Details'}
      </Button>
    </form>
  );
}

function RoleForm({ user, locked }: { user: AppUser; locked: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    setUserRoleAction,
    {},
  );
  // Rule 11 applies to a select the same as to a text field.
  const { values, set, register } = useKeptValues({ role: user.role }, state);
  const chosen = values.role as Role;

  if (locked) {
    return (
      <p className="text-sm">
        <span className="font-medium">{roleLabel(user.role)}</span>. Locked while
        this is the last active Owner.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <Field label="Role" hint={roleDescription(chosen)}>
        <Select
          name="role"
          ref={register('role')}
          value={values.role}
          onChange={(event) => set({ role: event.target.value as Role })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </Select>
      </Field>
      <Result state={state} />
      {/* An explicit button, not a select that saves the moment it changes: a
          stray click must not be able to grant somebody Owner. */}
      <Button type="submit" icon="check" disabled={pending || chosen === user.role}>
        {pending ? 'Saving' : 'Change Role'}
      </Button>
    </form>
  );
}

function PasswordForm({ user, isSelf }: { user: AppUser; isSelf: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <Field
        label="New Password"
        hint={
          isSelf
            ? 'Setting your own password here signs you out of every other device. It does not ask for your current one, because you are an Owner.'
            : `At least twelve characters. Give it to ${user.name} directly, and this signs them out everywhere.`
        }
      >
        {/* Not held by useKeptValues on purpose: a password should not sit in
            component state across a failed save. */}
        <TextInput
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </Field>
      <Result state={state} />
      <Button type="submit" icon="check" disabled={pending}>
        {pending ? 'Saving' : 'Set Password'}
      </Button>
    </form>
  );
}

function StatusForm({
  user,
  isSelf,
  lastActiveOwner,
}: {
  user: AppUser;
  isSelf: boolean;
  lastActiveOwner: boolean;
}) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    setUserStatusAction,
    {},
  );
  const disabled = user.status === 'disabled';

  if (isSelf) {
    return (
      <p className="text-sm">
        <span className="font-medium">Active</span>. You cannot disable the
        account you are signed in with.
      </p>
    );
  }
  if (lastActiveOwner) {
    return (
      <p className="text-sm">
        <span className="font-medium">Active</span>. Locked while this is the
        last active Owner.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={user.id} />
      <input
        type="hidden"
        name="status"
        value={disabled ? 'active' : 'disabled'}
      />
      <p className="text-sm">
        <span className="font-medium">{disabled ? 'Disabled' : 'Active'}</span>.{' '}
        <span className="text-[var(--color-muted)]">
          {disabled
            ? 'This account cannot sign in. Enabling it lets them in again with the password they had.'
            : 'Disabling signs this account out everywhere and refuses it a new sign-in. The account is kept, because its name is on the entries it made.'}
        </span>
      </p>
      <Result state={state} />
      <Button type="submit" variant={disabled ? 'primary' : 'danger'} disabled={pending}>
        {pending ? 'Saving' : disabled ? 'Enable Account' : 'Disable Account'}
      </Button>
    </form>
  );
}
