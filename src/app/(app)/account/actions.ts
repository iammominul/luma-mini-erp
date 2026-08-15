'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  InputError,
  changeOwnPassword,
  signOutOtherSessions,
  updateUserProfile,
} from '@/lib/mutations';
import { firstError, ownPasswordSchema, userProfileSchema } from '@/lib/schemas';
import {
  ForbiddenError,
  actorOf,
  currentSessionId,
  currentUser,
} from '@/lib/session';

/**
 * Your own account.
 *
 * There is no permission on any of this: every role may change its own name,
 * email and password. What each action does check is that the id it is given is
 * the signed-in account's, because the id arrives in a form field and a form
 * field is whatever the browser sends. Changing somebody else's account is the
 * Owner's, on the Users screen.
 */

export type AccountState = { error?: string; done?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof InputError) return error.message;
  if (error instanceof z.ZodError) return firstError(error);
  return `Could not save: ${(error as Error).message}`;
}

/** The signed-in account, and nothing else, whatever the form claims. */
async function me() {
  const user = await currentUser();
  if (!user) {
    throw new ForbiddenError('Your session has ended. Sign in again.');
  }
  return user;
}

export async function updateProfileAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    const user = await me();
    const parsed = userProfileSchema.safeParse({
      id: user.id,
      name: text(formData, 'name'),
      email: text(formData, 'email'),
    });
    if (!parsed.success) return { error: firstError(parsed.error) };

    await updateUserProfile(
      user.id,
      { name: parsed.data.name, email: parsed.data.email },
      actorOf(user),
    );
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return { done: 'Your details are saved.' };
}

export async function changePasswordAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  try {
    const user = await me();
    const parsed = ownPasswordSchema.safeParse({
      currentPassword: String(formData.get('currentPassword') ?? ''),
      newPassword: String(formData.get('newPassword') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
    });
    if (!parsed.success) return { error: firstError(parsed.error) };

    await changeOwnPassword(
      user.id,
      {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
      await currentSessionId(),
    );
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return {
    done: 'Your password is changed. Any other device is now signed out.',
  };
}

export async function signOutOthersAction(
  _previous: AccountState,
  _formData: FormData,
): Promise<AccountState> {
  let count: number;
  try {
    const user = await me();
    count = await signOutOtherSessions(
      user.id,
      await currentSessionId(),
      actorOf(user),
    );
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/', 'layout');
  return {
    done:
      count === 0
        ? 'This is the only device signed in.'
        : `Signed out ${count} other ${count === 1 ? 'device' : 'devices'}.`,
  };
}
