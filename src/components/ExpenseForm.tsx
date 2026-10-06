'use client';

import { useActionState } from 'react';
import { COST_TIERS, EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/types';
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
  /** The order or order line it is filed against, when it is (2026-10-06). */
  salesOrderId: string;
  orderLineId: string;
  notes: string;
};

/** An order as the expense form offers it: the whole order, or one line. */
export type ExpenseOrderOption = {
  orderId: string;
  label: string;
  open: boolean;
  lines: { id: string; label: string }[];
};

/**
 * The For Order value carries which of the two it is, because one select
 * offers both: 'order:<id>' for the whole order, 'line:<id>' for one line.
 */
function pickOf(values: { salesOrderId: string; orderLineId: string }): string {
  if (values.orderLineId) return `line:${values.orderLineId}`;
  if (values.salesOrderId) return `order:${values.salesOrderId}`;
  return '';
}

export function ExpenseForm({
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  expenseId,
  orderOptions = [],
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
  orderOptions?: ExpenseOrderOption[];
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
      orderPick: pickOf(values),
      notes: values.notes,
      reason: '',
    },
    state,
  );

  const [pickKind, pickId] = field.orderPick.split(':');
  // Open orders only, and whatever this expense is already filed against.
  const offered = orderOptions.filter(
    (order) =>
      order.open ||
      field.orderPick === `order:${order.orderId}` ||
      order.lines.some((line) => field.orderPick === `line:${line.id}`),
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

          <Field label="Category">
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

          <Field label="Paid To">
            <TextInput
              type="text"
              name="payee"
              value={field.payee}
              onChange={(e) => set({ payee: e.target.value })}
              maxLength={200}
              autoComplete="off"
            />
          </Field>

          {/* The order record when there is one; the server writes the text
              reference from it. The text box is kept for a cost against an
              order that predates order records. */}
          <input
            type="hidden"
            name="salesOrderId"
            value={pickKind === 'order' ? (pickId ?? '') : ''}
          />
          <input
            type="hidden"
            name="orderLineId"
            value={pickKind === 'line' ? (pickId ?? '') : ''}
          />
          {offered.length > 0 ? (
            <Field label="For Order">
              <Select
                ref={register('orderPick')}
                value={field.orderPick}
                onChange={(e) => set({ orderPick: e.target.value })}
              >
                <option value="">Not for one order</option>
                {offered.map((order) => (
                  <optgroup key={order.orderId} label={order.label}>
                    <option value={`order:${order.orderId}`}>Whole order</option>
                    {order.lines.map((line) => (
                      <option key={line.id} value={`line:${line.id}`}>
                        {line.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          ) : null}
          {field.orderPick ? null : (
            <Field
              label="Order Reference"
              hint={offered.length > 0 ? 'Only for an order with no record' : 'As written on the bill'}
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
          )}

          <Field label="Reference" hint="Cheque or bank reference.">
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
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        <CancelLink href={cancelHref} />
      </FormActions>
    </form>
  );
}
