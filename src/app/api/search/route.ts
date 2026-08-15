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
 * It reads and never writes, so it needs no permission beyond being signed in:
 * every record it can return is one a Viewer may already open by its address.
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
  const hits = await searchRecords(term, 10);

  return NextResponse.json(
    { hits },
    // A search result is a live figure about a live book, and it is per user.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
