'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  InputError,
  createUser,
  resetUserPassword,
  setUserRole,
  setUserStatus,
  updateUserProfile,
} from '@/lib/mutations';
import { roleLabel } from '@/lib/permissions';
import {
  firstError,
  userFormSchema,
  userPasswordResetSchema,
  userProfileSchema,
  userRoleChangeSchema,
  userStatusChangeSchema,
} from '@/lib/schemas';
import { ForbiddenError, actingUser, actorOf } from '@/lib/session';

/**
 * Every action here checks 'user:manage' for itself. The Users screen is only
 * offered to an Owner and the page checks too, but a server action is a public
 * endpoint: anything that trusts the screen it was called from is not a check.
 *
 * Only creating a user leaves the screen. The rest are made on the Manage User
 * page and stay on it, saying what they did, because somebody setting a role is
 * often about to set a password too and being thrown back to the list between
 * each one is how a screen wastes somebody's afternoon.
 */

export type UserFormState = { error?: string; done?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save the user: ${(error as Error).message}`;
}

export async function createUserAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const parsed = userFormSchema.safeParse({
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    password: String(formData.get('password') ?? ''),
    role: text(formData, 'role'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('user:manage');
    await createUser(parsed.data, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/users');
}

/**
 * Name and email. The alternative to having this at all would be deleting the
 * account and making it again, which would lose its name from every log row it
 * wrote.
 */
export async function updateUserAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const parsed = userProfileSchema.safeParse({
    id: text(formData, 'id'),
    name: text(formData, 'name'),
    email: text(formData, 'email'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('user:manage');
    await updateUserProfile(
      parsed.data.id,
      { name: parsed.data.name, email: parsed.data.email },
      actorOf(actor),
    );
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return { done: 'Details saved.' };
}

export async function setUserRoleAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const parsed = userRoleChangeSchema.safeParse({
    id: text(formData, 'id'),
    role: text(formData, 'role'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('user:manage');
    await setUserRole(parsed.data.id, parsed.data.role, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return { done: `Role set to ${roleLabel(parsed.data.role)}.` };
}

export async function setUserStatusAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const parsed = userStatusChangeSchema.safeParse({
    id: text(formData, 'id'),
    status: text(formData, 'status'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('user:manage');
    await setUserStatus(parsed.data.id, parsed.data.status, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return {
    done:
      parsed.data.status === 'disabled'
        ? 'Account disabled and signed out everywhere.'
        : 'Account enabled.',
  };
}

export async function resetPasswordAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const parsed = userPasswordResetSchema.safeParse({
    id: text(formData, 'id'),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  try {
    const actor = await actingUser('user:manage');
    await resetUserPassword(parsed.data.id, parsed.data.password, actorOf(actor));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return {
    done: 'Password set. That account is now signed out everywhere. Give the new password to them directly.',
  };
}
