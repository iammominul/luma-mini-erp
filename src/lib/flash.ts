import { cookies } from 'next/headers';

/**
 * A one-line confirmation for the screen a save lands on: "Bill posted."
 *
 * A server action ends in a redirect, and a redirect carries no message, so a
 * save used to land on its record or its list with nothing to say it had
 * happened. The action sets this short-lived cookie just before it redirects,
 * and `FlashNotice` in the shell shows it once and clears it.
 *
 * It is a cookie rather than a query parameter so the address stays the
 * record's own (rule 11): a URL with `?saved=1` on it gets bookmarked and
 * pasted, and shows the confirmation again to whoever opens it. It is readable
 * from the page on purpose, because the page is what clears it, and it holds
 * nothing but the sentence the action wrote.
 */
export const FLASH_COOKIE = 'luma_flash';

export async function flash(message: string): Promise<void> {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, encodeURIComponent(message), {
    path: '/',
    maxAge: 30,
    sameSite: 'lax',
    httpOnly: false,
  });
}
