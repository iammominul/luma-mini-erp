import { NextResponse } from 'next/server';
import { searchRecords } from '@/lib/queries';
import { currentUser } from '@/lib/session';

/**
 * What the search box in the top bar reads while somebody types.
 *
 * A route handler is a public endpoint, so it checks the session for itself
 * exactly as a server action does. Being called from a component that is only
 * rendered behind a login proves nothing about who is calling it.
 *
 * It reads and never writes, and for most of the book it needs no permission
 * beyond being signed in: those records are ones any signed-in account may
 * already open by their address. Capital, drawings and the loan book are the
 * exception, and the role is passed down so searchRecords can hold them back
 * from an account that may not read them. The gate is there, not here.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Not requireUser: that redirects, and a redirect to an HTML login page is
  // not an answer a fetch can read. A signed out caller gets a plain 401.
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ hits: [] }, { status: 401 });
  }

  const term = new URL(request.url).searchParams.get('q') ?? '';
  // Ten is what fits under the box without turning into a page of its own.
  // The Search screen is where the whole list lives.
  const hits = await searchRecords(term, { limit: 10, role: user.role });

  return NextResponse.json(
    { hits },
    // A search result is a live figure about a live book, and it is per user.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
