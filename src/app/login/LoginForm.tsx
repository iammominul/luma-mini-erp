'use client';

import { useActionState } from 'react';
import { Button, Field, Notice, TextInput } from '@/components/ui';
import { useKeptValues } from '@/components/use-kept-values';
import { signInAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signInAction,
    {},
  );
  // Rule 11. A password that came back wrong should not also cost somebody the
  // email address they typed.
  const { values, set } = useKeptValues({ email: '' }, state);

  // The card is the page's, not this component's: the heading above these
  // fields belongs in the same box they do.
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <TextInput
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={values.email}
          onChange={(event) => set({ email: event.target.value })}
        />
      </Field>
      <Field label="Password">
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" icon="signin" className="w-full" disabled={pending}>
        {pending ? 'Signing In' : 'Sign In'}
      </Button>
    </form>
  );
}
