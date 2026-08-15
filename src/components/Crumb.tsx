'use client';

import { usePathname } from 'next/navigation';
import { groupLabelFor } from './nav-items';

/**
 * The menu group a screen lives in, printed above its title.
 *
 * The full ERP's navigation spec asks for this and gives the reason: a group
 * that is closed, or a rail that is collapsed, cannot say where you are, and
 * the six group model is only learned if the screens keep repeating it.
 *
 * It reads the path rather than taking a prop, so no page has to be edited and
 * no page can print a crumb that disagrees with the menu entry it was reached
 * from. That is the whole point of deriving it.
 */
export function Crumb() {
  const label = groupLabelFor(usePathname());
  if (!label) return null;
  return (
    <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-3)]">
      {label}
    </div>
  );
}
