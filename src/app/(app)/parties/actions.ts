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

/**
 * A party created from inside another form (2026-10-06): the "New Party"
 * dialog in the party picker on a bill, a Sales Order, a PO or a WO.
 *
 * Called as a function rather than posted as a form, so the dialog can sit
 * inside the form it serves without nesting one form in another, and so the
 * half-keyed document behind it is never submitted or reloaded. It takes only
 * what a new party needs to be billed: the name, the role the picker is for,
 * and a phone and address if they are to hand. The rest is set on the party's
 * own screen later. The same permission and the same mutation as the full
 * form, so nothing about a party made this way differs.
 */
export async function quickCreatePartyAction(input: {
  name: string;
  role: string;
  phone: string;
  address: string;
}): Promise<{ id: string; name: string } | { error: string }> {
  const parsed = partyFormSchema.safeParse({
    code: '',
    name: input.name,
    roles: [input.role],
    contactPerson: '',
    phone: input.phone,
    address: input.address,
    openingBalance: '0',
    openingAsOf: '',
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('party:manage');
    const id = await createParty(parsed.data, actorOf(actor));
    revalidatePath('/', 'layout');
    return { id, name: parsed.data.name };
  } catch (error) {
    return { error: message(error) };
  }
}
