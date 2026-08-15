'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createEmployee,
  setEmployeeActive,
  updateEmployee,
} from '@/lib/mutations';
import { employeeFormSchema, firstError } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

export type EmployeeFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function readEmployee(formData: FormData) {
  return employeeFormSchema.safeParse({
    code: text(formData, 'code'),
    name: text(formData, 'name'),
    designation: text(formData, 'designation'),
    phone: text(formData, 'phone'),
    nid: text(formData, 'nid'),
    address: text(formData, 'address'),
    joinedOn: text(formData, 'joinedOn'),
    basic: text(formData, 'basic') || '0',
    houseRent: text(formData, 'houseRent') || '0',
    medical: text(formData, 'medical') || '0',
    conveyance: text(formData, 'conveyance') || '0',
    mobileAllowance: text(formData, 'mobileAllowance') || '0',
    otherAllowance: text(formData, 'otherAllowance') || '0',
    paymentMethod: text(formData, 'paymentMethod') || 'cash',
    bankName: text(formData, 'bankName'),
    accountNo: text(formData, 'accountNo'),
    mfsNumber: text(formData, 'mfsNumber'),
    reason: text(formData, 'reason'),
  });
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the employee: ${(error as Error).message}`;
}

export async function createEmployeeAction(
  _previous: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = readEmployee(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('employee:manage');
    await createEmployee(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/employees');
}

export async function updateEmployeeAction(
  _previous: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const id = text(formData, 'id');
  const parsed = readEmployee(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.reason) {
    return { error: 'State why this employee record is being edited.' };
  }

  try {
    const actor = await actingUser('employee:manage');
    await updateEmployee(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/employees');
}

/**
 * An employee who has left is deactivated, never removed: their advances and
 * salaries are money that moved and stay on the record.
 */
export async function setEmployeeActiveAction(
  _previous: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  const reason = text(formData, 'reason');
  if (reason.length < 3) {
    return { error: 'State why this employee is being changed.' };
  }

  try {
    const actor = await actingUser('employee:manage');
    await setEmployeeActive(id, active, reason, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/employees');
}
