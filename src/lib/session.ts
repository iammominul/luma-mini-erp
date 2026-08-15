import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { can, type Permission, type Role } from './permissions';

/**
 * Who is asking, and what they are allowed to do.
 *
 * This is the real check. src/proxy.ts only looks at whether a session cookie
 * is present, which is enough to send a signed-out visitor to the login screen
 * but proves nothing: a cookie can be stale, and a role or a status can change
 * after it was issued. Every page and every server action that touches the book
 * comes through here, where the session is read from the database.
 *
 * currentUser is wrapped in React's cache, so several components on one page
 * asking who is signed in cost one query, not one each.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
};

export class ForbiddenError extends Error {}

const readSession = cache(
  async (): Promise<{ user: SessionUser; sessionId: string } | null> => {
    const result = await auth().api.getSession({ headers: await headers() });
    const user = result?.user as SessionUser | undefined;
    if (!user) return null;
    // A disabled account keeps its rows and its name in the log, but it stops
    // being able to sign in the moment an Owner disables it, even though the
    // cookie it holds is still valid.
    if (user.status !== 'active') return null;
    const sessionId = (result?.session as { id?: string } | undefined)?.id;
    return { user, sessionId: sessionId ?? '' };
  },
);

export const currentUser = async (): Promise<SessionUser | null> =>
  (await readSession())?.user ?? null;

/**
 * The session this request is being made on.
 *
 * Needed by "sign out everywhere else" and by a password change, both of which
 * drop every session but the one in front of the person doing it. Without it
 * they would sign themselves out in the act of securing the account.
 */
export const currentSessionId = async (): Promise<string | null> =>
  (await readSession())?.sessionId ?? null;

/** For a page. Sends anyone without a live session back to the login screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * For a page. The permission is checked as well as the session.
 *
 * A page a role cannot read is a 404 rather than a redirect loop, on the same
 * reasoning as rule 12: a screen somebody is not entitled to is an ordinary
 * event, and telling them it exists tells them something.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return user;
}

/**
 * For a server action. Throws rather than redirects, because an action returns
 * its error to the form that called it and the message is shown there.
 */
export async function actingUser(
  permission: Permission,
): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    throw new ForbiddenError('Your session has ended. Sign in again.');
  }
  if (!can(user.role, permission)) {
    throw new ForbiddenError(
      'Your role does not allow this. Ask an Owner if you need it.',
    );
  }
  return user;
}

import type { Actor } from './types';

export type { Actor };

/** What gets written to activity_log and onto a payroll approval. */
export function actorOf(user: SessionUser): Actor {
  return { id: user.id, name: user.name };
}
