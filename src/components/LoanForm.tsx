'use client';

import { useActionState } from 'react';
import { PAYMENT_MODES } from '@/lib/types';
import {
  Button,
  CancelLink,
  Card,
  Field,
  FormActions,
  Notice,
  Select,
  Textarea,
  TextInput,
} from './ui';
import { useKeptValues } from './use-kept-values';

export type LoanFormState = { error?: string };

export type LoanFormValues = {
  lender: string;
  amount: string;
  takenOn: string;
  mode: string;
  terms: string;
  reference: string;
  notes: string;
};

/**
 * Taking a loan, on one screen.
 *
 * Seven fields, and Amount is one of them: a loan record with no money against
 * it is not a loan, so the drawdown is recorded by the same save rather than by
 * a second visit to a second screen.
 *
 * On an edit the Amount and Method fields are not shown. The money that came in
 * is a voucher on the loan's own ledger, and correcting it there is what keeps
 * the outstanding and the Cash Book agreeing.
 */
export function LoanForm({
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  loanId,
  showActive = false,
}: {
  action: (state: LoanFormState, formData: FormData) => Promise<LoanFormState>;
  values: LoanFormValues & { active?: string };
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  loanId?: string;
  showActive?: boolean;
}) {
  const [state, submit, pending] = useActionState<LoanFormState, FormData>(
    action,
    {},
  );

  const {
    values: field,
    set,
    register,
  } = useKeptValues(
    {
      lender: values.lender,
      amount: values.amount,
      takenOn: values.takenOn,
      mode: values.mode,
      terms: values.terms,
      reference: values.reference,
      active: values.active ?? 'yes',
      notes: values.notes,
      reason: '',
    },
    state,
  );

  const isEdit = Boolean(loanId);

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      {loanId ? <input type="hidden" name="id" value={loanId} /> : null}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lender" hint="A bank, a person or another company.">
            <TextInput
              type="text"
              name="lender"
              value={field.lender}
              onChange={(e) => set({ lender: e.target.value })}
              maxLength={160}
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Date Received">
            <TextInput
              type="date"
              name="takenOn"
              value={field.takenOn}
              onChange={(e) => set({ takenOn: e.target.value })}
              required
            />
          </Field>

          {isEdit ? null : (
            <>
              <Field label="Amount Received (Tk)">
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
            </>
          )}

          <Field label="Reference" hint="Sanction letter or account number.">
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
            label="Interest and Terms"
            hint="In words. Nothing here is computed."
          >
            <Textarea
              name="terms"
              value={field.terms}
              onChange={(e) => set({ terms: e.target.value })}
              maxLength={500}
            />
          </Field>

          {showActive ? (
            <Field label="Status" hint="A settled loan is closed, not removed.">
              <Select
                ref={register('active')}
                name="active"
                value={field.active}
                onChange={(e) => set({ active: e.target.value })}
              >
                <option value="yes">Running</option>
                <option value="">Settled</option>
              </Select>
            </Field>
          ) : null}

          <Field label="Note">
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
