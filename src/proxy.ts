import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { LEGACY_SIDES } from './lib/side';

/**
 * Runs before every page and route. ("Proxy" is what Next 16 calls what used to
 * be middleware.)
 *
 * This checks only that a session cookie is present and correctly signed. It
 * deliberately does not read the database: the Edge runtime has no connection
 * pool, and putting one here would open a pool on every request. So this is an
 * optimistic redirect and nothing more. Whether the session is still live,
 * whether the account has since been disabled, and what the account is allowed
 * to do are all settled in src/lib/session.ts, which every page and action
 * calls. A forged or expired cookie gets past this file and is stopped there.
 */
export async function proxy(request: NextRequest) {
  // The lens used to be singular in a URL. Anything sent out under the old shape
  // still arrives here, so it is moved on to the current one rather than being
  // told it does not exist. Permanent, because it is not coming back.
  const [, first = '', ...rest] = request.nextUrl.pathname.split('/');
  const plural = LEGACY_SIDES[first];
  if (plural) {
    const url = request.nextUrl.clone();
    url.pathname = `/${[plural, ...rest].join('/')}`;
    return NextResponse.redirect(url, 308);
  }

  const hasSession = Boolean(getSessionCookie(request));
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!hasSession && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Deliberately no "signed in, so leave the login page" branch here, and it is
  // the one thing this file must not do. A cookie can outlive the session it
  // names: resetting a password and disabling an account both drop every
  // session row, and the browser keeps holding the cookie. This file cannot
  // tell that cookie from a live one, so a redirect made on it would send the
  // browser to a page that reads the database, finds nothing, and sends it back
  // here, forever. That loop is what ERR_TOO_MANY_REDIRECTS is.
  //
  // Sending somebody who is genuinely signed in on to the dashboard is done by
  // the login page instead, which runs on Node and can ask.
  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets, a file served from public/, and the
  // API.
  //
  // A file in public/ is excluded because this file redirects a signed out
  // request to the login screen, and the login screen is itself signed out:
  // it asks for /brand-mark.svg, that request arrives here with no cookie, and
  // it was answered with the login page's own HTML. The browser got a document
  // where an image should be and drew a broken one. Only the extension is
  // matched, not the name, because the next asset dropped in public/ would
  // arrive with the same fault and no clue as to why.
  //
  // Nothing here is behind a login in any case. A brand mark and a robots.txt
  // are public files on a public path, which is what public/ means.
  //
  // The API is excluded because this file's whole job is to send a browser to
  // the login screen, and an HTML redirect is not an answer a fetch can read:
  // a signed out request to a route handler wants a 401 it can act on, not a
  // login page it will try to parse as JSON. Better Auth's own endpoints are
  // out for the older version of the same reason, that sending an
  // unauthenticated sign-in POST to the login page would break signing in.
  //
  // Nothing is weakened by this. Per rule 13 the proxy proves nothing anyway:
  // it sees only that a cookie is present and correctly signed. Every route
  // handler checks the session itself against the database, exactly as every
  // page and every server action does. A new route under /api must do the
  // same, and is a public endpoint until it does.
  matcher: [
    '/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff|woff2)$).*)',
  ],
};
