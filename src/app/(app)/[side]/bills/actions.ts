'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  InputError,
  createBill,
  deleteBill,
  postBill,
  updateBill,
} from '@/lib/mutations';
import { billNoExists } from '@/lib/queries';
import { billFormSchema, deleteSchema, firstError } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';
import { type Side, copyFor, isSide } from '@/lib/side';
import { z } from 'zod';

export type BillFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function sideOf(formData: FormData): Side {
  const side = text(formData, 'side');
  return isSide(side) ? side : 'customers';
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
    direction: copyFor(sideOf(formData)).billDirection,
    partyRole: copyFor(sideOf(formData)).role,
    status: text(formData, 'status') === 'draft' ? 'draft' : 'posted',
    billNo: text(formData, 'billNo'),
    natureOfWork: text(formData, 'natureOfWork') || 'dyeing_finishing',
    billDate: text(formData, 'billDate'),
    narration: text(formData, 'narration'),
    notes: text(formData, 'notes'),
    reason: text(formData, 'reason'),
    lines: readLines(formData),
  });
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
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
    const actor = await actingUser('bill:manage');
    id = await createBill(parsed.data, actorOf(actor));
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
    const actor = await actingUser('bill:manage');
    await updateBill(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills/${id}`);
}

export async function postBillAction(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const side = sideOf(formData);
  const id = text(formData, 'id');

  try {
    const actor = await actingUser('bill:manage');
    await postBill(id, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills/${id}`);
}

/**
 * Whether a bill number is already in the book, asked while it is being typed.
 *
 * A warning, not a gate. The save still runs the same check inside the write,
 * which is the one that counts: this one can be stale by the time Save is
 * pressed. It exists because a repeated number used to be discovered only after
 * the whole bill had been keyed, which is what CLAUDE.md rule 11 was written
 * about.
 *
 * Permission checked like any other action. It answers a question about the
 * book, so it is not something to leave open to anyone who finds the endpoint.
 */
export async function checkBillNoAction(input: {
  side: string;
  billNo: string;
  partyId: string;
  excludeId?: string;
}): Promise<{ taken: boolean; message: string | null }> {
  const side = isSide(input.side) ? input.side : 'customers';
  const direction = copyFor(side).billDirection;
  const billNo = input.billNo.trim();

  // A subcontractor number is only unique within its subcontractor, so there is
  // nothing to ask until one has been chosen.
  if (!billNo) return { taken: false, message: null };
  if (direction === 'received' && !input.partyId) {
    return { taken: false, message: null };
  }

  try {
    await actingUser('bill:manage');
    const { taken, partyName } = await billNoExists({
      partyId: input.partyId,
      direction,
      billNo,
      excludeId: input.excludeId,
    });
    if (!taken) return { taken: false, message: null };
    return {
      taken: true,
      message: `Bill ${billNo} is already recorded against ${partyName ?? 'another party'}.`,
    };
  } catch {
    // The field is a courtesy. If it cannot be answered, say nothing and let
    // the save be the one that refuses.
    return { taken: false, message: null };
  }
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
    const actor = await actingUser('bill:manage');
    await deleteBill(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect(`/${side}/bills`);
}
