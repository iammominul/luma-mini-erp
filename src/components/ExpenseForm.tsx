'use client';

import { useActionState } from 'react';
import { COST_TIERS, EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/types';
import { Button, CancelLink, Card, Field, FormActions, Notice, Select, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type ExpenseFormState = { error?: string };

export type ExpenseFormValues = {
  spentOn: string;
  category: string;
  payee: string;
  description: string;
  amount: string;
  mode: string;
  reference: string;
  orderNo: string;
  notes: string;
};

export function ExpenseForm({
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  expenseId,
}: {
  action: (
    state: ExpenseFormState,
    formData: FormData,
  ) => Promise<ExpenseFormState>;
  values: ExpenseFormValues;
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  expenseId?: string;
}) {
  const [state, submit, pending] = useActionState<ExpenseFormState, FormData>(
    action,
    {},
  );

  // What was typed stays typed when a save comes back with an error.
  const {
    values: field,
    set,
    register,
  } = useKeptValues(
    {
      spentOn: values.spentOn,
      category: values.category,
      payee: values.payee,
      description: values.description,
      amount: values.amount,
      mode: values.mode,
      reference: values.reference,
      orderNo: values.orderNo,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      {expenseId ? <input type="hidden" name="id" value={expenseId} /> : null}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date Paid">
            <TextInput
              type="date"
              name="spentOn"
              value={field.spentOn}
              onChange={(e) => set({ spentOn: e.target.value })}
              required
            />
          </Field>

          <Field
            label="Category"
            hint="Kept close to the full ERP's expense accounts, so a voucher maps across without reclassifying."
          >
            <Select
              ref={register('category')}
              name="category"
              value={field.category}
              onChange={(e) => set({ category: e.target.value })}
              required
            >
              {COST_TIERS.map((tier) => (
                <optgroup key={tier.value} label={tier.label}>
                  {EXPENSE_CATEGORIES.filter(
                    (category) => category.tier === tier.value,
                  ).map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
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
            label="Paid To"
            hint="Who received the money. Free text: most of these are not a party on the ledger."
          >
            <TextInput
              type="text"
              name="payee"
              value={field.payee}
              onChange={(e) => set({ payee: e.target.value })}
              maxLength={200}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Order Reference"
            hint="The order this cost belongs to, written the same way it is on the bill. Leave blank when it is not for one particular order."
          >
            <TextInput
              type="text"
              name="orderNo"
              value={field.orderNo}
              onChange={(e) => set({ orderNo: e.target.value })}
              maxLength={60}
              autoComplete="off"
            />
          </Field>

          <Field label="Reference" hint="Voucher serial, cheque number, or bank reference.">
            <TextInput
              type="text"
              name="reference"
              value={field.reference}
              onChange={(e) => set({ reference: e.target.value })}
              maxLength={80}
              autoComplete="off"
            />
          </Field>

          <Field label="Description">
            <TextInput
              type="text"
              name="description"
              value={field.description}
              onChange={(e) => set({ description: e.target.value })}
              maxLength={300}
              autoComplete="off"
              required
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
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        <CancelLink href={cancelHref} />
      </FormActions>
    </form>
  );
}
