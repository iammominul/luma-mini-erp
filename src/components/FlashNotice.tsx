'use client';

import { useEffect, useState } from 'react';

const COOKIE = 'luma_flash';

function readFlash(): string | null {
  const entry = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(COOKIE.length + 1));
  } catch {
    return null;
  }
}

/**
 * The confirmation a save leaves behind, shown once at the foot of the screen
 * and gone after a few seconds. The action wrote it with `flash()` in
 * src/lib/flash.ts; this reads it and clears it.
 *
 * It looks for the cookie on a short interval rather than on navigation,
 * because some saves redirect to the very screen they were made on (a status
 * change on an order), and a path that has not changed fires no navigation.
 * Reading one cookie twice a second costs nothing.
 *
 * A bar of navy with plain white text, the way an enterprise system confirms
 * a posting: no icon, no color for success, no animation beyond a fade.
 * `role="status"` reads it out without moving focus off the work.
 */
export function FlashNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const found = readFlash();
      if (!found) return;
      document.cookie = `${COOKIE}=; Max-Age=0; path=/`;
      setMessage(found);
    };
    check();
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-app-chrome
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {message ? (
        <div className="pointer-events-auto flex items-center gap-4 rounded-control bg-navy px-4 py-2.5 text-body text-white shadow-[var(--shadow-pop)]">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-meta font-medium text-white/70 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
