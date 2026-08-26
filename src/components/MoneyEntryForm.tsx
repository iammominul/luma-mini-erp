'use client';

import { useActionState } from 'react';
import { PAYMENT_MODES } from '@/lib/types';
import {
  Button,
  Field,
  FormActions,
  Notice,
  Select,
  TextInput,
} from './ui';
import { useKeptValues } from './use-kept-values';

export type MoneyEntryState = { error?: string };

/**
 * Four fields: date, amount, method, note.
 *
 * This is every money entry the fund side takes, and it is deliberately one
 * component rather than four nearly identical ones. What it never carries is a
 * category: the action it posts to decides that, so there is nothing on the
 * screen to choose and nothing to get wrong.
 *
 * It sits inside the page that reads from it rather than on a route of its own.
 * A four-field form does not earn a second screen, and a second screen is what
 * the owner asked to be rid of.
 */
export function MoneyEntryForm({
  action,
  submitLabel,
  today,
  amountLabel = 'Amount (Tk)',
  extra,
}: {
  action: (
    state: MoneyEntryState,
    formData: FormData,
  ) => Promise<MoneyEntryState>;
  submitLabel: string;
  /** 'YYYY-MM-DD' in Asia/Dhaka, so the field opens on today. */
  today: string;
  amountLabel?: string;
  /** Fields this particular entry needs beyond the four. */
  extra?: React.ReactNode;
}) {
  const [state, submit, pending] = useActionState<MoneyEntryState, FormData>(
    action,
    {},
  );

  const {
    values: field,
    set,
    register,
  } = useKeptValues(
    { movedOn: today, amount: '', mode: 'bank_transfer', notes: '' },
    state,
  );

  return (
    <form action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <TextInput
            type="date"
            name="movedOn"
            value={field.movedOn}
            onChange={(e) => set({ movedOn: e.target.value })}
            required
          />
        </Field>

        <Field label={amountLabel}>
          <TextInput
            name="amount"
            value={field.amount}
            onChange={(e) => set({ amount: e.target.value })}
            inputMode="decimal"
            className="text-right"
            placeholder="0.00"
            required
          />
        </Field>

        <Field label="Method">
          <Select
            ref={register('mode')}
            name="mode"
            value={field.mode}
            onChange={(e) => set({ mode: e.target.value })}
            required
          >
            {PAYMENT_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note">
          <TextInput
            type="text"
            name="notes"
            value={field.notes}
            onChange={(e) => set({ notes: e.target.value })}
            maxLength={1000}
            autoComplete="off"
          />
        </Field>

        {extra}
      </div>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <FormActions>
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
