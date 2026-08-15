'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createExpense,
  deleteExpense,
  updateExpense,
} from '@/lib/mutations';
import { deleteSchema, expenseFormSchema, firstError } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type ExpenseFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function readExpense(formData: FormData) {
  return expenseFormSchema.safeParse({
    spentOn: text(formData, 'spentOn'),
    category: text(formData, 'category'),
    payee: text(formData, 'payee'),
    description: text(formData, 'description'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    reference: text(formData, 'reference'),
    orderNo: text(formData, 'orderNo'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the expense: ${(error as Error).message}`;
}

export async function createExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = readExpense(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('expense:manage');
    await createExpense(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/expenses');
}

export async function updateExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const id = text(formData, 'id');
  const parsed = readExpense(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) {
    return { error: 'State why this expense is being edited.' };
  }

  try {
    const actor = await actingUser('expense:manage');
    await updateExpense(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/expenses');
}

export async function deleteExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('expense:manage');
    await deleteExpense(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/expenses');
}
