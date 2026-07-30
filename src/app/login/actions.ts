'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isCorrectPassword,
  issueSessionValue,
} from '@/lib/auth';
import { requireEnv } from '@/lib/env';

export type LoginState = { error?: string };

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  if (!password) return { error: 'Enter the password.' };

  if (!(await isCorrectPassword(password, requireEnv('APP_PASSWORD')))) {
    return { error: 'That password is not correct.' };
  }

  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: await issueSessionValue(requireEnv('SESSION_SECRET')),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
