'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createParty,
  setPartyActive,
  updateParty,
} from '@/lib/mutations';
import { firstError, partyFormSchema } from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

/**
 * Every action here checks 'party:manage' for itself. A server action is a
 * public endpoint: the menu hiding a button is not what stops anybody, this is.
 */

export type PartyFormState = { error?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function readParty(formData: FormData) {
  return partyFormSchema.safeParse({
    code: text(formData, 'code'),
    name: text(formData, 'name'),
    roles: formData.getAll('roles').map(String),
    contactPerson: text(formData, 'contactPerson'),
    phone: text(formData, 'phone'),
    address: text(formData, 'address'),
    openingBalance: text(formData, 'openingBalance') || '0',
    openingAsOf: text(formData, 'openingAsOf'),
  });
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the party: ${(error as Error).message}`;
}

export async function createPartyAction(
  _previous: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const parsed = readParty(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('party:manage');
    await createParty(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/parties');
}

export async function updatePartyAction(
  _previous: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const id = text(formData, 'id');
  const parsed = readParty(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('party:manage');
    await updateParty(id, parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/parties');
}

export async function togglePartyActiveAction(
  formData: FormData,
): Promise<void> {
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  const actor = await actingUser('party:manage');
  await setPartyActive(id, active, actorOf(actor));
  revalidatePath('/', 'layout');
}
