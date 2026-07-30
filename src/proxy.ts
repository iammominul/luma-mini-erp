import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSessionValue } from './lib/auth';

/**
 * Nothing but the login page is reachable without the shared password. This runs
 * before every page and route, so a missed check on a page cannot leak the
 * books. ("Proxy" is what Next 16 calls what used to be middleware.)
 */
export async function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Failing closed is the only safe option: without the secret no cookie can
    // be verified, so no page may be served.
    return new NextResponse(
      'SESSION_SECRET is not set on the server. See interim-billing/README.md.',
      { status: 500 },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = await isValidSessionValue(cookie, secret);
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!signedIn && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (signedIn && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
