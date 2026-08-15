'use client';

import { useActionState } from 'react';
import { EXPENSE_CLAIM_CATEGORIES } from '@/lib/types';
import { Button, CancelLink, Card, Field, FormActions, Notice, Select, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type ClaimFormState = { error?: string };

/**
 * A member of staff claiming back money they spent.
 *
 * Separate from an expense, which is money the company has already paid out,
 * and separate from payroll: a reimbursement is not pay and never lands on a
 * payslip.
 */
export function ClaimForm({
  employees,
  action,
  cancelHref,
  defaultEmployeeId,
  today,
}: {
  employees: { id: string; name: string; code: string | null }[];
  action: (
    state: ClaimFormState,
    formData: FormData,
  ) => Promise<ClaimFormState>;
  cancelHref: string;
  defaultEmployeeId: string;
  today: string;
}) {
  const [state, submit, pending] = useActionState<ClaimFormState, FormData>(
    action,
    {},
  );

  const { values, set, register } = useKeptValues(
    {
      employeeId: defaultEmployeeId,
      claimedOn: today,
      category: 'transport',
      description: '',
      amount: '',
      orderNo: '',
      notes: '',
    },
    state,
  );

  return (
    <form action={submit} className="max-w-3xl space-y-4">
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee">
            <Select
              ref={register('employeeId')}
              name="employeeId"
              value={values.employeeId}
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

          <Field label="Date Spent">
            <TextInput
              type="date"
              name="claimedOn"
              value={values.claimedOn}
              onChange={(e) => set({ claimedOn: e.target.value })}
              required
            />
          </Field>

          <Field label="Category">
            <Select
              ref={register('category')}
              name="category"
              value={values.category}
              onChange={(e) => set({ category: e.target.value })}
              required
            >
              {EXPENSE_CLAIM_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
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

          <Field label="Description">
            <TextInput
              type="text"
              name="description"
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
              maxLength={300}
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Order Reference"
            hint="The order this was spent on, if it was for one. A claim is overhead either way; this only records what it was against."
          >
            <TextInput
              type="text"
              name="orderNo"
              value={values.orderNo}
              onChange={(e) => set({ orderNo: e.target.value })}
              maxLength={60}
              autoComplete="off"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              name="notes"
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
              maxLength={1000}
            />
          </Field>
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <FormActions>
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : 'Save Claim'}
        </Button>
        <CancelLink href={cancelHref} />
      </FormActions>
    </form>
  );
}
