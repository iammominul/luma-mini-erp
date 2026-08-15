'use client';

import { useActionState } from 'react';
import { PAYMENT_MODES } from '@/lib/types';
import { Button, Notice, Select, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type ReimburseState = { error?: string };

/**
 * Paying one claim back, inline on the row it belongs to.
 *
 * The date and the mode are controlled through useKeptValues rather than set
 * with defaultValue, because a refused reimburse re-renders the page from the
 * server and the server does not know what was picked: an uncontrolled pair
 * would answer the error by throwing away the answer. The mode is a select, so
 * it also needs register, which puts it back after React resets the form.
 */
export function ReimburseForm({
  claimId,
  today,
  action,
}: {
  claimId: string;
  today: string;
  action: (
    state: ReimburseState,
    formData: FormData,
  ) => Promise<ReimburseState>;
}) {
  const [state, submit, pending] = useActionState<ReimburseState, FormData>(
    action,
    {},
  );

  const { values, set, register } = useKeptValues(
    { reimbursedOn: today, mode: 'cash' },
    state,
  );

  return (
    <form action={submit} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={claimId} />
      <TextInput
        type="date"
        name="reimbursedOn"
        value={values.reimbursedOn}
        onChange={(e) => set({ reimbursedOn: e.target.value })}
        required
        className="w-full sm:w-36"
      />
      <Select
        ref={register('mode')}
        name="mode"
        value={values.mode}
        onChange={(e) => set({ mode: e.target.value })}
        required
        className="w-full sm:w-32"
      >
        {PAYMENT_MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Saving' : 'Reimburse'}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}
