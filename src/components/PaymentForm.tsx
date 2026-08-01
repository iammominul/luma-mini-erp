'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { SideCopy } from '@/lib/side';
import { PAYMENT_MODES } from '@/lib/types';
import { Button, Card, Field, Notice, Select, Textarea, TextInput } from './ui';

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

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      <input type="hidden" name="side" value={copy.side} />
      {paymentId ? <input type="hidden" name="id" value={paymentId} /> : null}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.partyWord}>
            <Select name="partyId" defaultValue={values.partyId} required>
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
              defaultValue={values.paidOn}
              required
            />
          </Field>

          <Field label="Amount (Tk)">
            <TextInput
              name="amount"
              defaultValue={values.amount}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
              required
            />
          </Field>

          <Field label="Mode">
            <Select name="mode" defaultValue={values.mode} required>
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
              name="reference"
              defaultValue={values.reference}
              maxLength={80}
            />
          </Field>

          <Field
            label="Narration"
            hint="Shown on the ledger after the mode, as Payment Received / LC / UCB. Blank shows the mode alone."
          >
            <TextInput
              name="narration"
              defaultValue={values.narration}
              maxLength={200}
              placeholder="UCB / BTB LC"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              name="notes"
              defaultValue={values.notes}
              maxLength={1000}
            />
          </Field>

          {requireReason ? (
            <Field
              label="Reason for the Edit"
              hint="Recorded in the activity log."
            >
              <Textarea name="reason" required maxLength={300} />
            </Field>
          ) : null}
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
