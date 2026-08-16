'use client';

import { useActionState } from 'react';
import { Button, Card, CardHeader, Field, Notice, TextInput } from '@/components/ui';
import { useKeptValues } from '@/components/use-kept-values';
import {
  changePasswordAction,
  signOutOthersAction,
  updateProfileAction,
  type AccountState,
} from './actions';

/**
 * Three separate forms rather than one.
 *
 * A password change has to state the current password and a name change must
 * not, so putting them together would either ask for a password to correct a
 * spelling or let a password through without one. They also succeed and fail
 * independently, and each says so on its own.
 */
export function AccountForms({
  name,
  email,
  role,
  roleNote,
  lastSignedInAt,
}: {
  name: string;
  email: string;
  role: string;
  roleNote: string;
  lastSignedInAt: string | null;
}) {
  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader title="Your Details" />
        <div className="p-4">
          <ProfileForm name={name} email={email} />
        </div>
      </Card>

      {/* The account menu in the bar links straight here, so the anchor has to
          be on the card rather than only on the page. */}
      <Card id="password">
        <CardHeader title="Your Password" />
        <div className="p-4">
          <PasswordForm />
        </div>
      </Card>

      <Card>
        <CardHeader title="Signed In Elsewhere" />
        <div className="p-4">
          <SignOutOthers />
        </div>
      </Card>

      <Card className="p-4 text-sm">
        <p>
          Your role is <span className="font-medium">{role}</span>.{' '}
          <span className="text-[var(--color-muted)]">{roleNote}</span>
        </p>
        <p className="mt-1 text-[var(--color-muted)]">
          A role is changed by an Owner, never by the person holding it. Last
          signed in: {lastSignedInAt ?? 'not recorded'}.
        </p>
      </Card>
    </div>
  );
}

function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateProfileAction,
    {},
  );
  // Rule 11, and it matters more here: a rejected email must not also cost the
  // name typed with it.
  const { values, set } = useKeptValues({ name, email }, state);

  return (
    <form action={action} className="space-y-4">
      <Field label="Full Name" hint="Printed on a payroll approval you make.">
        <TextInput
          name="name"
          required
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <Field label="Email" hint="This is what you sign in with.">
        <TextInput
          name="email"
          type="email"
          required
          autoComplete="username"
          value={values.email}
          onChange={(event) => set({ email: event.target.value })}
        />
      </Field>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.done ? <Notice>{state.done}</Notice> : null}
      <Button type="submit" icon="check" disabled={pending}>
        {pending ? 'Saving' : 'Save Details'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {/* Not held by useKeptValues on purpose: a password should not sit in
          component state across a failed save, and it is short to key again. */}
      <Field label="Current Password">
        <TextInput
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="New Password" hint="At least twelve characters.">
        <TextInput
          name="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm New Password">
        <TextInput
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </Field>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.done ? <Notice>{state.done}</Notice> : null}
      <Button type="submit" icon="check" disabled={pending}>
        {pending ? 'Saving' : 'Change Password'}
      </Button>
    </form>
  );
}

function SignOutOthers() {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    signOutOthersAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        Signs out every other browser and device this account is open in. This
        one stays signed in. Use it after working on a shared machine.
      </p>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.done ? <Notice>{state.done}</Notice> : null}
      <Button type="submit" variant="secondary" icon="signout" disabled={pending}>
        {pending ? 'Signing Out' : 'Sign Out Other Devices'}
      </Button>
    </form>
  );
}
