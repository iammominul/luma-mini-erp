'use client';

import { useEffect, useState } from 'react';

/** Where the rail replaces the drawer. The same figure as Tailwind's `md`. */
const WIDE = '(min-width: 768px)';

/**
 * Whether the screen is wide enough for the left rail.
 *
 * It starts true so the server render and the first client render agree on the
 * desktop layout, the same way the rail's collapsed state starts false and is
 * read from storage afterwards. A phone corrects itself in the mount effect,
 * before paint.
 */
export function useIsWide() {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return wide;
}
