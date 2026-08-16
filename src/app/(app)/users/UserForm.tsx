'use client';

import { useActionState } from 'react';
import {
  Button,
  CancelLink,
  Card,
  Field,
  Notice,
  Select,
  TextInput,
} from '@/components/ui';
import { useKeptValues } from '@/components/use-kept-values';
import { ROLES, roleDescription, roleLabel } from '@/lib/permissions';
import { createUserAction, type UserFormState } from './actions';

export function UserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    createUserAction,
    {},
  );
  // Rule 11. A password that came back too short must not also cost the name,
  // the email and the role that were keyed with it.
  const { values, set, register } = useKeptValues(
    { name: '', email: '', role: 'accounts' },
    state,
  );

  return (
    <Card className="max-w-lg p-5">
      <form action={action} className="space-y-4">
        <Field label="Full Name">
          <TextInput
            name="name"
            required
            autoFocus
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>

        <Field label="Email">
          <TextInput
            name="email"
            type="email"
            required
            autoComplete="off"
            value={values.email}
            onChange={(event) => set({ email: event.target.value })}
          />
        </Field>

        <Field label="Role" hint={roleDescription(values.role as 'accounts')}>
          <Select
            name="role"
            ref={register('role')}
            value={values.role}
            onChange={(event) => set({ role: event.target.value })}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Password"
          hint="At least twelve characters. Give it to the person directly and have them change it."
        >
          {/* Not held by useKeptValues on purpose: a password should not sit
              in component state across a failed save. It is short to key
              again, and the fields that are long to key are the ones kept. */}
          <TextInput
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={12}
          />
        </Field>

        {state.error ? <Notice tone="error">{state.error}</Notice> : null}

        <div className="flex gap-2">
          <Button type="submit" icon="check" disabled={pending}>
            {pending ? 'Saving' : 'Add User'}
          </Button>
          <CancelLink href="/users" />
        </div>
      </form>
    </Card>
  );
}
