'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createLoan,
  deleteFundMovement,
  deleteLoan,
  recordLoanDrawdown,
  recordLoanRepayment,
  updateLoan,
} from '@/lib/mutations';
import {
  deleteSchema,
  firstError,
  loanDrawdownSchema,
  loanEditSchema,
  loanFormSchema,
  loanRepaymentSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type LoanFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the loan: ${(error as Error).message}`;
}

/**
 * Taking a loan: the loan record and the money it put in the account, one save.
 *
 * These were two screens and two saves. A loan does not exist until money has
 * moved, so recording it is one action.
 */
export async function createLoanAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const parsed = loanFormSchema.safeParse({
    lender: text(formData, 'lender'),
    amount: text(formData, 'amount'),
    takenOn: text(formData, 'takenOn'),
    mode: text(formData, 'mode'),
    terms: text(formData, 'terms'),
    reference: text(formData, 'reference'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await createLoan(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/loans');
}

export async function updateLoanAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const id = text(formData, 'id');
  const parsed = loanEditSchema.safeParse({
    lender: text(formData, 'lender'),
    takenOn: text(formData, 'takenOn'),
    terms: text(formData, 'terms'),
    reference: text(formData, 'reference'),
    active: text(formData, 'active'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) {
    return { error: 'State why this loan is being edited.' };
  }

  try {
    const actor = await actingUser('fund:manage');
    await updateLoan(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/loans');
}

/** An installment: principal off the debt, interest as a cost, one cheque. */
export async function recordRepaymentAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const parsed = loanRepaymentSchema.safeParse({
    loanId: text(formData, 'loanId'),
    movedOn: text(formData, 'movedOn'),
    amount: text(formData, 'amount'),
    interestAmount: text(formData, 'interestAmount'),
    mode: text(formData, 'mode'),
    reference: text(formData, 'reference'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let code = '';
  try {
    const actor = await actingUser('fund:manage');
    await recordLoanRepayment(parsed.data, actorOf(actor));
    code = text(formData, 'code');
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(code ? `/loans/${code}` : '/loans');
}

/** A further drawing on a facility already opened. */
export async function recordDrawdownAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const parsed = loanDrawdownSchema.safeParse({
    loanId: text(formData, 'loanId'),
    movedOn: text(formData, 'movedOn'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    reference: text(formData, 'reference'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let code = '';
  try {
    const actor = await actingUser('fund:manage');
    await recordLoanDrawdown(parsed.data, actorOf(actor));
    code = text(formData, 'code');
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(code ? `/loans/${code}` : '/loans');
}

export async function removeLoanEntryAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await deleteFundMovement(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/loans');
}

export async function deleteLoanAction(
  _previous: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await deleteLoan(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/loans');
}
