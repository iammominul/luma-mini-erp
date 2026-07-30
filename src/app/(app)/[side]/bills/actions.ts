'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  InputError,
  createBill,
  deleteBill,
  updateBill,
} from '@/lib/mutations';
import { billFormSchema, deleteSchema, firstError } from '@/lib/schemas';
import { isSide } from '@/lib/side';
import { z } from 'zod';

export type BillFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function sideOf(formData: FormData): string {
  const side = text(formData, 'side');
  return isSide(side) ? side : 'customer';
}

/** The line grid is posted as JSON, so a line never gets split across keys. */
function readLines(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get('linesJson') ?? '[]'));
  } catch {
    return [];
  }
}

function readBill(formData: FormData) {
  return billFormSchema.safeParse({
    partyId: text(formData, 'partyId'),
    billNo: text(formData, 'billNo'),
    billDate: text(formData, 'billDate'),
    reference: text(formData, 'reference'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
    lines: readLines(formData),
  });
}

function message(error: unknown): string {
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the bill: ${(error as Error).message}`;
}

export async function createBillAction(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const side = sideOf(formData);
  const parsed = readBill(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  let id: string;
  try {
    id = await createBill(parsed.data);
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills/${id}`);
}

export async function updateBillAction(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const side = sideOf(formData);
  const id = text(formData, 'id');
  const parsed = readBill(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) {
    return { error: 'State why this bill is being edited.' };
  }

  try {
    await updateBill(id, parsed.data);
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills/${id}`);
}

export async function deleteBillAction(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const side = sideOf(formData);
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    await deleteBill(parsed.data.id, parsed.data.reason);
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills`);
}
