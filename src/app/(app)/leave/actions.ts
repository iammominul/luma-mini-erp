'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createLeaveRecord,
  deleteLeaveRecord,
} from '@/lib/mutations';
import { deleteSchema, firstError, leaveFormSchema } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type LeaveFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the leave: ${(error as Error).message}`;
}

export async function createLeaveAction(
  _previous: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const parsed = leaveFormSchema.safeParse({
    employeeId: text(formData, 'employeeId'),
    leaveType: text(formData, 'leaveType'),
    fromDate: text(formData, 'fromDate'),
    toDate: text(formData, 'toDate'),
    days: text(formData, 'days'),
    reason: text(formData, 'reason'),
    editReason: text(formData, 'editReason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('employee:manage');
    await createLeaveRecord(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/leave');
}

export async function deleteLeaveAction(
  _previous: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const parsed = deleteSchema.safeParse({
    id: text(formData, 'id'),
    reason: text(formData, 'reason'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('employee:manage');
    await deleteLeaveRecord(parsed.data.id, parsed.data.reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/leave');
}
