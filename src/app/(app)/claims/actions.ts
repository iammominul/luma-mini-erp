'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createExpenseClaim,
  deleteExpenseClaim,
  reimburseExpenseClaim,
} from '@/lib/mutations';
import {
  deleteSchema,
  expenseClaimFormSchema,
  firstError,
  reimburseClaimSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type ClaimFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the claim: ${(error as Error).message}`;
}

export async function createClaimAction(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const parsed = expenseClaimFormSchema.safeParse({
    employeeId: text(formData, 'employeeId'),
    claimedOn: text(formData, 'claimedOn'),
    category: text(formData, 'category'),
    description: text(formData, 'description'),
    amount: text(formData, 'amount'),
    orderNo: text(formData, 'orderNo'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('expense:manage');
    await createExpenseClaim(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/claims');
}

export async function reimburseClaimAction(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const parsed = reimburseClaimSchema.safeParse({
    id: text(formData, 'id'),
    reimbursedOn: text(formData, 'reimbursedOn'),
    mode: text(formData, 'mode'),
    reference: text(formData, 'reference'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('expense:manage');
    await reimburseExpenseClaim(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/claims');
}

export async function deleteClaimAction(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('expense:manage');
    await deleteExpenseClaim(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/claims');
}
