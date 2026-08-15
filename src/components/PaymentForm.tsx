'use client';

import { useActionState } from 'react';
import type { SideCopy } from '@/lib/side';
import { PAYMENT_MODES } from '@/lib/types';
import { Button, CancelLink, Card, Field, FormActions, Notice, Select, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type PaymentFormState = { error?: string };

export type PaymentFormValues = {
  partyId: string;
  narration: string;
  paidOn: string;
  amount: string;
  mode: string;
  reference: string;
  notes: string;
};

export function PaymentForm({
  copy,
  parties,
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  paymentId,
}: {
  copy: SideCopy;
  parties: { id: string; name: string }[];
  action: (
    state: PaymentFormState,
    formData: FormData,
  ) => Promise<PaymentFormState>;
  values: PaymentFormValues;
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  paymentId?: string;
}) {
  const [state, submit, pending] = useActionState<PaymentFormState, FormData>(
    action,
    {},
  );

  // What was typed stays typed when a save comes back with an error.
  const { values: field, set, register } = useKeptValues(
    {
      partyId: values.partyId,
      paidOn: values.paidOn,
      amount: values.amount,
      mode: values.mode,
      reference: values.reference,
      narration: values.narration,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      <input type="hidden" name="side" value={copy.side} />
      {paymentId ? <input type="hidden" name="id" value={paymentId} /> : null}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.partyWord}>
            <Select
              ref={register('partyId')}
              name="partyId"
              value={field.partyId}
              onChange={(e) => set({ partyId: e.target.value })}
              required
            >
              <option value="">Select {copy.partyWord}</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={`Date ${copy.role === 'customer' ? 'Received' : 'Paid'}`}
          >
            <TextInput
              type="date"
              name="paidOn"
              value={field.paidOn}
              onChange={(e) => set({ paidOn: e.target.value })}
              required
            />
          </Field>

          <Field label="Amount (Tk)">
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

          <Field label="Mode">
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

          <Field
            label="Reference"
            hint={
              copy.role === 'customer'
                ? 'Money Receipt serial, cheque number, or bank reference.'
                : 'Cheque number or bank reference.'
            }
          >
            <TextInput
              type="text"
              name="reference"
              value={field.reference}
              onChange={(e) => set({ reference: e.target.value })}
              maxLength={80}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Narration"
            hint="Shown on the ledger after the mode, as Payment Received / LC / UCB. Blank shows the mode alone."
          >
            <TextInput
              type="text"
              name="narration"
              value={field.narration}
              onChange={(e) => set({ narration: e.target.value })}
              maxLength={200}
              autoComplete="off"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              name="notes"
              value={field.notes}
              onChange={(e) => set({ notes: e.target.value })}
              maxLength={1000}
            />
          </Field>

          {requireReason ? (
            <Field
              label="Reason for the Edit"
              hint="Recorded in the activity log."
            >
              <Textarea
                name="reason"
                value={field.reason}
                onChange={(e) => set({ reason: e.target.value })}
                required
                maxLength={300}
              />
            </Field>
          ) : null}
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <FormActions>
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        <CancelLink href={cancelHref} />
      </FormActions>
    </form>
  );
}
