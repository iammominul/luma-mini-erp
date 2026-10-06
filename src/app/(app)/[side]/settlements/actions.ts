'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createPayment,
  deletePayment,
  updatePayment,
} from '@/lib/mutations';
import { deleteSchema, firstError, paymentFormSchema } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';
import { type Side, copyFor, isSide } from '@/lib/side';

export type PaymentFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function sideOf(formData: FormData): Side {
  const side = text(formData, 'side');
  return isSide(side) ? side : 'customers';
}

function readPayment(formData: FormData) {
  return paymentFormSchema.safeParse({
    partyId: text(formData, 'partyId'),
    direction: copyFor(sideOf(formData)).paymentDirection,
    partyRole: copyFor(sideOf(formData)).role,
    paidOn: text(formData, 'paidOn'),
    amount: text(formData, 'amount'),
    mode: text(formData, 'mode'),
    reference: text(formData, 'reference'),
    narration: text(formData, 'narration'),
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

export async function createPaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const side = sideOf(formData);
  const parsed = readPayment(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('settlement:manage');
    await createPayment(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(returnTo(formData) ?? `/${side}/settlements`);
}

/**
 * Where a receipt recorded from the dialog on a statement or a bill goes back
 * to (2026-10-06): the screen it was opened from. Only a path within this app
 * is honored, so the field cannot be used to send anybody elsewhere.
 */
function returnTo(formData: FormData): string | null {
  const path = text(formData, 'returnTo');
  return path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export async function updatePaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const side = sideOf(formData);
  const id = text(formData, 'id');
  const parsed = readPayment(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) {
    return { error: 'State why this entry is being edited.' };
  }

  try {
    const actor = await actingUser('settlement:manage');
    await updatePayment(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/settlements`);
}

export async function deletePaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const side = sideOf(formData);
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('settlement:manage');
    await deletePayment(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/settlements`);
}
