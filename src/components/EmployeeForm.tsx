'use client';

import { useActionState } from 'react';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { grossOf } from '@/lib/payroll';
import { PAYMENT_METHODS } from '@/lib/types';
import {
  Button,
  CancelLink,
  Card,
  CardHeader,
  Field,
  FormActions,
  Notice,
  Select,
  Textarea,
  TextInput,
} from './ui';
import { useKeptValues } from './use-kept-values';

export type EmployeeFormState = { error?: string };

export type EmployeeFormValues = {
  code: string;
  name: string;
  designation: string;
  phone: string;
  nid: string;
  address: string;
  joinedOn: string;
  basic: string;
  houseRent: string;
  medical: string;
  conveyance: string;
  mobileAllowance: string;
  otherAllowance: string;
  paymentMethod: string;
  bankName: string;
  accountNo: string;
  mfsNumber: string;
};

/** The gross as it is being typed, or null while a field is half entered. */
function previewGross(values: EmployeeFormValues): Money | null {
  try {
    return grossOf({
      basic: Money.fromDecimal(values.basic || '0'),
      houseRent: Money.fromDecimal(values.houseRent || '0'),
      medical: Money.fromDecimal(values.medical || '0'),
      conveyance: Money.fromDecimal(values.conveyance || '0'),
      mobileAllowance: Money.fromDecimal(values.mobileAllowance || '0'),
      otherAllowance: Money.fromDecimal(values.otherAllowance || '0'),
    });
  } catch {
    return null;
  }
}

export function EmployeeForm({
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  employeeId,
}: {
  action: (
    state: EmployeeFormState,
    formData: FormData,
  ) => Promise<EmployeeFormState>;
  values: EmployeeFormValues;
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  employeeId?: string;
}) {
  const [state, submit, pending] = useActionState<EmployeeFormState, FormData>(
    action,
    {},
  );

  const {
    values: field,
    set,
    register,
  } = useKeptValues({ ...values, reason: '' }, state);

  const gross = previewGross(field);

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      {employeeId ? <input type="hidden" name="id" value={employeeId} /> : null}

      <Card>
        <CardHeader title="Personal Information" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              type="text"
              name="name"
              value={field.name}
              onChange={(e) => set({ name: e.target.value })}
              maxLength={200}
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Employee Code"
            hint="Leave blank and the next code is assigned, as EMP-0001."
          >
            <TextInput
              type="text"
              name="code"
              value={field.code}
              onChange={(e) => set({ code: e.target.value })}
              maxLength={20}
              autoComplete="off"
            />
          </Field>

          <Field label="Designation">
            <TextInput
              type="text"
              name="designation"
              value={field.designation}
              onChange={(e) => set({ designation: e.target.value })}
              maxLength={120}
              autoComplete="off"
            />
          </Field>

          <Field label="Joining Date">
            <TextInput
              type="date"
              name="joinedOn"
              value={field.joinedOn}
              onChange={(e) => set({ joinedOn: e.target.value })}
            />
          </Field>

          <Field label="Mobile">
            <TextInput
              type="text"
              name="phone"
              value={field.phone}
              onChange={(e) => set({ phone: e.target.value })}
              maxLength={40}
              autoComplete="off"
            />
          </Field>

          <Field label="NID">
            <TextInput
              type="text"
              name="nid"
              value={field.nid}
              onChange={(e) => set({ nid: e.target.value })}
              maxLength={40}
              autoComplete="off"
            />
          </Field>

          <Field label="Address">
            <Textarea
              name="address"
              value={field.address}
              onChange={(e) => set({ address: e.target.value })}
              maxLength={400}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Salary Structure" />
        <p className="border-b border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
          Set once and edited when it changes. Each month&apos;s payroll copies
          these figures, so a later raise never restates a payslip already
          handed out.
        </p>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Basic Salary (Tk)">
            <TextInput
              name="basic"
              value={field.basic}
              onChange={(e) => set({ basic: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
          <Field label="House Rent (Tk)">
            <TextInput
              name="houseRent"
              value={field.houseRent}
              onChange={(e) => set({ houseRent: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
          <Field label="Medical (Tk)">
            <TextInput
              name="medical"
              value={field.medical}
              onChange={(e) => set({ medical: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
          <Field label="Conveyance (Tk)">
            <TextInput
              name="conveyance"
              value={field.conveyance}
              onChange={(e) => set({ conveyance: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
          <Field label="Mobile (Tk)">
            <TextInput
              name="mobileAllowance"
              value={field.mobileAllowance}
              onChange={(e) => set({ mobileAllowance: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
          <Field label="Other Allowance (Tk)">
            <TextInput
              name="otherAllowance"
              value={field.otherAllowance}
              onChange={(e) => set({ otherAllowance: e.target.value })}
              inputMode="decimal"
              className="text-right"
              placeholder="0.00"
            />
          </Field>
        </div>
        <div className="flex items-baseline justify-between border-t border-[var(--color-line)] px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Gross Salary
          </span>
          <span className="numeric text-xl font-semibold">
            {gross ? formatTaka(gross) : ''}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Payment" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Payment Method">
            <Select
              ref={register('paymentMethod')}
              name="paymentMethod"
              value={field.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value })}
              required
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Bank Name">
            <TextInput
              type="text"
              name="bankName"
              value={field.bankName}
              onChange={(e) => set({ bankName: e.target.value })}
              maxLength={120}
              autoComplete="off"
            />
          </Field>

          <Field label="Account Number">
            <TextInput
              type="text"
              name="accountNo"
              value={field.accountNo}
              onChange={(e) => set({ accountNo: e.target.value })}
              maxLength={60}
              autoComplete="off"
            />
          </Field>

          <Field label="MFS Number" hint="bKash, Nagad or Rocket.">
            <TextInput
              type="text"
              name="mfsNumber"
              value={field.mfsNumber}
              onChange={(e) => set({ mfsNumber: e.target.value })}
              maxLength={40}
              autoComplete="off"
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
