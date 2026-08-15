'use client';

import { useActionState } from 'react';
import { LEAVE_TYPES } from '@/lib/payroll';
import { Button, CancelLink, Card, Field, FormActions, Notice, Select, Textarea, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type LeaveFormState = { error?: string };

/**
 * Recording leave.
 *
 * The days are typed rather than worked out from the dates, because a leave
 * that spans a weekly holiday is not the number of days between two dates and
 * only the person filing it knows which it was. Nothing here moves money:
 * casual, sick and earned leave are paid.
 */
export function LeaveForm({
  employees,
  action,
  cancelHref,
  defaultEmployeeId,
  today,
}: {
  employees: { id: string; name: string; code: string | null }[];
  action: (
    state: LeaveFormState,
    formData: FormData,
  ) => Promise<LeaveFormState>;
  cancelHref: string;
  defaultEmployeeId: string;
  today: string;
}) {
  const [state, submit, pending] = useActionState<LeaveFormState, FormData>(
    action,
    {},
  );

  const { values, set, register } = useKeptValues(
    {
      employeeId: defaultEmployeeId,
      leaveType: 'casual',
      fromDate: today,
      toDate: today,
      days: '1',
      reason: '',
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

          <Field label="Leave Type">
            <Select
              ref={register('leaveType')}
              name="leaveType"
              value={values.leaveType}
              onChange={(e) => set({ leaveType: e.target.value })}
              required
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="First Day">
            <TextInput
              type="date"
              name="fromDate"
              value={values.fromDate}
              onChange={(e) => set({ fromDate: e.target.value })}
              required
            />
          </Field>

          <Field label="Last Day">
            <TextInput
              type="date"
              name="toDate"
              value={values.toDate}
              onChange={(e) => set({ toDate: e.target.value })}
              required
            />
          </Field>

          <Field
            label="Days Taken"
            hint="Typed rather than counted, because a weekly holiday in the middle is not a leave day. Half a day is 0.5."
          >
            <TextInput
              name="days"
              value={values.days}
              onChange={(e) => set({ days: e.target.value })}
              inputMode="decimal"
              className="text-right"
              required
            />
          </Field>

          <Field label="Reason">
            <Textarea
              name="reason"
              value={values.reason}
              onChange={(e) => set({ reason: e.target.value })}
              maxLength={300}
            />
          </Field>
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <FormActions>
        <Button type="submit" icon="check" disabled={pending}>
          {pending ? 'Saving' : 'Save Leave'}
        </Button>
        <CancelLink href={cancelHref} />
      </FormActions>
    </form>
  );
}
