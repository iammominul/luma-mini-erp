'use client';

import { useActionState, useRef } from 'react';
import { createPaymentAction } from '@/app/(app)/[side]/settlements/actions';
import { PAYMENT_MODES } from '@/lib/types';
import { useKeptValues } from './use-kept-values';
import { Button, Field, Notice, Select, TextInput } from './ui';

/**
 * Record Receipt, or Record Payment, without leaving the screen (2026-10-06).
 *
 * Opened from a party's statement or from a bill, with the party already
 * chosen, because that is where somebody is when the cheque arrives. It is a
 * dialog because it is four fields; a bill, with its lines, never is. It posts
 * through the same action as the full receipt screen, numbers the voucher the
 * same way, and comes back to the screen it was opened from. What was typed is
 * kept if the save comes back with an error (rule 12).
 */
export function RecordPaymentDialog({
  side,
  partyId,
  partyName,
  isReceipt,
  returnTo,
  today,
  suggestedAmount,
}: {
  side: string;
  partyId: string;
  partyName: string;
  isReceipt: boolean;
  returnTo: string;
  today: string;
  /** What is outstanding, offered as the amount; always editable. */
  suggestedAmount?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit, pending] = useActionState<{ error?: string }, FormData>(
    createPaymentAction,
    {},
  );
  const { values, set, register } = useKeptValues(
    {
      paidOn: today,
      amount: suggestedAmount ?? '',
      mode: 'bank_transfer',
      reference: '',
    },
    state,
  );
  const title = isReceipt ? 'Record Receipt' : 'Record Payment';

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        icon="plus"
        onClick={() => dialog.current?.showModal()}
      >
        {title}
      </Button>
      <dialog
        ref={dialog}
        className="w-[min(28rem,calc(100vw-2rem))] rounded border border-[var(--color-rule)] bg-white p-0 backdrop:bg-black/30"
        aria-label={title}
      >
        <form action={submit}>
          <input type="hidden" name="side" value={side} />
          <input type="hidden" name="partyId" value={partyId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="border-b border-[var(--color-rule)] px-4 py-2.5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-[var(--color-muted)]">
              {isReceipt ? 'From' : 'To'} {partyName}
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={isReceipt ? 'Date Received' : 'Date Paid'}>
              <TextInput
                type="date"
                name="paidOn"
                value={values.paidOn}
                onChange={(e) => set({ paidOn: e.target.value })}
                required
              />
            </Field>
            <Field label="Amount (Tk)">
              <TextInput
                name="amount"
                value={values.amount}
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
                value={values.mode}
                onChange={(e) => set({ mode: e.target.value })}
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paper Ref / Cheque">
              <TextInput
                type="text"
                name="reference"
                value={values.reference}
                onChange={(e) => set({ reference: e.target.value })}
                maxLength={80}
                autoComplete="off"
              />
            </Field>
            {state.error ? (
              <div className="sm:col-span-2">
                <Notice tone="error">{state.error}</Notice>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-rule)] px-4 py-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" icon="check" disabled={pending}>
              {pending ? 'Saving' : isReceipt ? 'Save Receipt' : 'Save Payment'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
