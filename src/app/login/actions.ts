'use server';

import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import { auth } from '@/lib/auth';

export type LoginState = { error?: string };

/**
 * Sign in with an email and a password.
 *
 * This goes through Better Auth's server side API rather than its browser
 * client, so the whole exchange is one server action and the form keeps what
 * was typed when it comes back with an error. The nextCookies plugin writes the
 * session cookie from here.
 *
 * A wrong email and a wrong password give the same message on purpose. Telling
 * somebody that an address exists but the password is wrong tells them which
 * addresses are worth attacking.
 */
export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email) return { error: 'Enter your email address.' };
  if (!password) return { error: 'Enter your password.' };

  try {
    await auth().api.signInEmail({ body: { email, password } });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: 'That email address and password do not match.' };
    }
    throw error;
  }

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const { headers } = await import('next/headers');
  await auth().api.signOut({ headers: await headers() });
  redirect('/login');
}
