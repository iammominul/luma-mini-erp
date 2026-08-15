import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

/**
 * Better Auth's own endpoints: sign in, sign out, and the session read.
 *
 * Sign-up is enabled in the library so the seed script and an Owner can create
 * accounts server side, but the public route is refused here. The full ERP
 * blocks the same route in main.ts for the same reason: this is an internal
 * book and nobody grants themselves an account. An Owner adds users on the
 * Users screen.
 */

const handlers = toNextJsHandler(auth().handler);

function isSignUp(request: Request): boolean {
  return new URL(request.url).pathname.startsWith('/api/auth/sign-up');
}

const signUpRefused = () =>
  Response.json(
    { message: 'Sign-up is closed. An Owner creates accounts.' },
    { status: 403 },
  );

export const GET = handlers.GET;

export async function POST(request: Request): Promise<Response> {
  if (isSignUp(request)) return signUpRefused();
  return handlers.POST(request);
}
