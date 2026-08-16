'use client';

import { useActionState } from 'react';
import { RECOVERY_MODES } from '@/lib/payroll';
import { PAYMENT_MODES } from '@/lib/types';
import { Button, CancelLink, Card, Field, FormActions, Notice, Select, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type AdvanceFormState = { error?: string };

export type AdvanceFormValues = {
  employeeId: string;
  paidOn: string;
  amount: string;
  mode: string;
  recoveryMode: string;
  installmentAmount: string;
  recoverFrom: string;
  reference: string;
  notes: string;
};

export function AdvanceForm({
  employees,
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  advanceId,
}: {
  employees: { id: string; name: string; code: string | null }[];
  action: (
    state: AdvanceFormState,
    formData: FormData,
  ) => Promise<AdvanceFormState>;
  values: AdvanceFormValues;
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  advanceId?: string;
}) {
  const [state, submit, pending] = useActionState<AdvanceFormState, FormData>(
    action,
    {},
  );

  const {
    values: field,
    set,
    register,
  } = useKeptValues(
    {
      employeeId: values.employeeId,
      paidOn: values.paidOn,
      amount: values.amount,
      mode: values.mode,
      recoveryMode: values.recoveryMode,
      installmentAmount: values.installmentAmount,
      recoverFrom: values.recoverFrom,
      reference: values.reference,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      {advanceId ? <input type="hidden" name="id" value={advanceId} /> : null}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee">
            <Select
              ref={register('employeeId')}
              name="employeeId"
              value={field.employeeId}
              onChange={(e) => set({ employeeId: e.target.value })}
              required
            >
              <option value="">Select Employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.code
                    ? `${employee.code} ${employee.name}`
                    : employee.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date Paid">
            <TextInput
              type="date"
              name="paidOn"
              value={field.paidOn}
              onChange={(e) => set({ paidOn: e.target.value })}
              required
            />
          </Field>

          <Field
            label="Amount (Tk)"
            hint="Recovered from a later salary. What is still outstanding is worked out on the Employees page."
          >
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
            label="Recovery"
            hint="How this comes back out of a salary. Whatever is chosen, the figure on a payroll line can still be changed or zeroed for a month."
          >
            <Select
              ref={register('recoveryMode')}
              name="recoveryMode"
              value={field.recoveryMode}
              onChange={(e) => set({ recoveryMode: e.target.value })}
              required
            >
              {RECOVERY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
          </Field>

          {field.recoveryMode === 'installment' ? (
            <Field
              label="Installment (Tk)"
              hint="Taken each month until the advance is cleared. The last one is whatever is left."
            >
              <TextInput
                name="installmentAmount"
                value={field.installmentAmount}
                onChange={(e) => set({ installmentAmount: e.target.value })}
                inputMode="decimal"
                className="text-right"
                placeholder="0.00"
              />
            </Field>
          ) : null}

          {field.recoveryMode === 'manual' ? null : (
            <Field
              label="Recover From"
              hint="The first month it may be taken from. Leave blank to start with the next payroll."
            >
              <TextInput
                type="month"
                name="recoverFrom"
                value={field.recoverFrom}
                onChange={(e) => set({ recoverFrom: e.target.value })}
              />
            </Field>
          )}

          <Field label="Reference" hint="Voucher serial or cheque number.">
            <TextInput
              type="text"
              name="reference"
              value={field.reference}
              onChange={(e) => set({ reference: e.target.value })}
              maxLength={80}
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
