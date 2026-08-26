'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  deleteFundMovement,
  recordCapital,
  recordDrawing,
} from '@/lib/mutations';
import { deleteSchema, firstError, ownerMovementSchema } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type OwnerFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function readMovement(formData: FormData) {
  return ownerMovementSchema.safeParse({
    movedOn: text(formData, 'movedOn'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
  });
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the entry: ${(error as Error).message}`;
}

/**
 * Two actions, and the category is not one of the things either takes.
 *
 * The screen has a Record Capital button and a Record Drawing button, and which
 * one was pressed is what decides the category. Nothing is chosen from a list,
 * so nothing can be chosen wrongly.
 */
export async function recordCapitalAction(
  _previous: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = readMovement(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await recordCapital(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/owner');
}

export async function recordDrawingAction(
  _previous: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = readMovement(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('fund:manage');
    await recordDrawing(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/owner');
}

export async function removeOwnerEntryAction(
  _previous: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
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
  redirect('/owner');
}
