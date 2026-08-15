'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  addEmployeeToRun,
  approvePayrollRun,
  createAdvance,
  deleteAdvance,
  fillAdvanceRecoveries,
  generatePayrollRun,
  markPayrollRunPaid,
  reopenPayrollRun,
  savePayrollLines,
  updateAdvance,
} from '@/lib/mutations';
import { PayrollError } from '@/lib/payroll';
import {
  advanceFormSchema,
  deleteSchema,
  firstError,
  payrollLineFormSchema,
  payrollReopenSchema,
  payrollRunFormSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type PayrollFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  // A net that will not go positive is a statement about the figures entered,
  // not a fault, so it reads as a form message like any other.
  if (error instanceof PayrollError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the entry: ${(error as Error).message}`;
}

// Advances --------------------------------------------------------------------

function readAdvance(formData: FormData) {
  return advanceFormSchema.safeParse({
    employeeId: text(formData, 'employeeId'),
    paidOn: text(formData, 'paidOn'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    recoveryMode: text(formData, 'recoveryMode') || 'manual',
    installmentAmount: text(formData, 'installmentAmount'),
    recoverFrom: text(formData, 'recoverFrom'),
    reference: text(formData, 'reference'),
    reason: text(formData, 'reason'),
    notes: text(formData, 'notes'),
  });
}

export async function createAdvanceAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const parsed = readAdvance(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('payroll:manage');
    await createAdvance(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/payroll/advances');
}

export async function updateAdvanceAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const id = text(formData, 'id');
  const parsed = readAdvance(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('payroll:manage');
    await updateAdvance(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/payroll/advances');
}

export async function deleteAdvanceAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('payroll:manage');
    await deleteAdvance(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/payroll/advances');
}

// Payroll runs ----------------------------------------------------------------

export async function generatePayrollRunAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const parsed = payrollRunFormSchema.safeParse({
    period: text(formData, 'period'),
    perDayBasis: text(formData, 'perDayBasis') || 'thirty',
    // An unticked checkbox posts nothing at all, so presence is the answer.
    recoverAdvances: formData.has('recoverAdvances'),
    notes: text(formData, 'notes'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let period: string;
  try {
    const actor = await actingUser('payroll:manage');
    await generatePayrollRun(parsed.data, actorOf(actor));
    period = parsed.data.period;
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}

/**
 * Refills the advance column of a draft from the recovery agreements.
 *
 * Deliberately a button somebody presses rather than something that runs on
 * its own: it overwrites whatever was keyed, and an automatic overwrite of a
 * figure HR chose is the one thing this whole feature must not do.
 */
export async function fillAdvanceRecoveriesAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  try {
    const actor = await actingUser('payroll:manage');
    await fillAdvanceRecoveries(text(formData, 'runId'), actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/', 'layout');
  return {};
}

/**
 * Saves the whole grid in one post.
 *
 * The rows arrive as parallel arrays, one entry per line, which is what a form
 * with repeated field names sends. Nothing here computes money: the ids and the
 * keyed figures go to the mutation and the server works out the rest.
 */
export async function savePayrollLinesAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const runId = text(formData, 'runId');
  const period = text(formData, 'period');
  const ids = formData.getAll('lineId').map((v) => String(v));

  const value = (key: string, index: number): string =>
    String(formData.getAll(key)[index] ?? '').trim();

  const lines = [];
  for (let i = 0; i < ids.length; i++) {
    const parsed = payrollLineFormSchema.safeParse({
      id: ids[i],
      absentDays: value('absentDays', i) || '0',
      bonus: value('bonus', i) || '0',
      additionalAllowance: value('additionalAllowance', i) || '0',
      advanceDeduction: value('advanceDeduction', i) || '0',
      otherDeduction: value('otherDeduction', i) || '0',
      remarks: value('remarks', i),
    });
    if (!parsed.success) return { error: firstError(parsed.error) };
    lines.push(parsed.data);
  }

  try {
    const actor = await actingUser('payroll:manage');
    await savePayrollLines(runId, lines, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}

export async function addEmployeeToRunAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const runId = text(formData, 'runId');
  const period = text(formData, 'period');
  const employeeId = text(formData, 'employeeId');

  try {
    const actor = await actingUser('payroll:manage');
    await addEmployeeToRun(runId, employeeId, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}

export async function approvePayrollRunAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const period = text(formData, 'period');
  const runId = text(formData, 'runId');
  if (!runId) return { error: 'That payroll run could not be identified.' };

  try {
    // Owner only, and the name on the approval is this account's. Nobody types
    // who they are at this step any more.
    const actor = await actingUser('payroll:approve');
    await approvePayrollRun(runId, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}

export async function markPayrollRunPaidAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const period = text(formData, 'period');
  const paidOn = text(formData, 'paidOn');
  const runId = text(formData, 'runId');
  if (!runId) return { error: 'That payroll run could not be identified.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: 'Enter the date the salaries were paid.' };
  }

  try {
    const actor = await actingUser('payroll:approve');
    await markPayrollRunPaid(runId, paidOn, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}

export async function reopenPayrollRunAction(
  _previous: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  const period = text(formData, 'period');
  const parsed = payrollReopenSchema.safeParse({
    id: text(formData, 'runId'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    // Reopening undoes an approval, so it takes the same right as making one.
    const actor = await actingUser('payroll:approve');
    await reopenPayrollRun(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/payroll/${period}`);
}
