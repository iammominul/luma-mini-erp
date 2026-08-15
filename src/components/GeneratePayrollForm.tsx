'use client';

import { useActionState } from 'react';
import { PER_DAY_BASES } from '@/lib/payroll';
import { Button, Field, Notice, Select, TextInput } from './ui';
import { useKeptValues } from './use-kept-values';

export type GeneratePayrollState = { error?: string };

/**
 * Starts a month.
 *
 * Only three things are asked for, because everything else comes from the
 * employees themselves. The per day basis is set here rather than per employee:
 * it is one policy for the month, and it is stored on the run so a later change
 * of policy cannot restate a month already paid.
 */
export function GeneratePayrollForm({
  action,
  defaultPeriod,
}: {
  action: (
    state: GeneratePayrollState,
    formData: FormData,
  ) => Promise<GeneratePayrollState>;
  defaultPeriod: string;
}) {
  const [state, submit, pending] = useActionState<
    GeneratePayrollState,
    FormData
  >(action, {});

  const { values, set, register } = useKeptValues(
    {
      period: defaultPeriod,
      perDayBasis: 'thirty',
      // Held as 'yes' or blank so every value in the hook stays a string.
      recoverAdvances: 'yes',
      notes: '',
    },
    state,
  );

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Month">
          <TextInput
            type="month"
            name="period"
            value={values.period}
            onChange={(e) => set({ period: e.target.value })}
            required
          />
        </Field>

        <Field
          label="Per Day Basis"
          hint="How a day of pay is worked out for an unpaid absence."
        >
          <Select
            ref={register('perDayBasis')}
            name="perDayBasis"
            value={values.perDayBasis}
            onChange={(e) => set({ perDayBasis: e.target.value })}
            required
          >
            {PER_DAY_BASES.map((basis) => (
              <option key={basis.value} value={basis.value}>
                {basis.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes">
          <TextInput
            type="text"
            name="notes"
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            maxLength={1000}
            autoComplete="off"
          />
        </Field>
      </div>

      <label className="flex max-w-2xl items-start gap-2 text-sm">
        <input
          ref={register('recoverAdvances')}
          type="checkbox"
          name="recoverAdvances"
          value="yes"
          checked={values.recoverAdvances !== ''}
          onChange={(e) =>
            set({ recoverAdvances: e.target.checked ? 'yes' : '' })
          }
          className="mt-0.5"
        />
        <span>
          Recover Advances
          <span className="block text-xs text-[var(--color-muted)]">
            Fills each line with what that employee&rsquo;s advances are due to
            take back this month. Leave it off in a month advances are not
            collected, such as when the festival bonus is paid. Either way the
            figure on any line can be changed before the payroll is approved.
          </span>
        </span>
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Button type="submit" icon="check" disabled={pending}>
        {pending ? 'Generating' : 'Generate Payroll'}
      </Button>
    </form>
  );
}
