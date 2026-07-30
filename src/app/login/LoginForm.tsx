'use client';

import { useActionState } from 'react';
import { Button, Card, Field, Notice, TextInput } from '@/components/ui';
import { signInAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signInAction,
    {},
  );

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <Field label="Password">
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
        </Field>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Signing In' : 'Sign In'}
        </Button>
      </form>
    </Card>
  );
}
