'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { NavIcon } from './NavIcon';
import { can, roleLabel } from '@/lib/permissions';

/**
 * Who is signed in, and the three things they can do about it, from the bar.
 *
 * This used to sit at the foot of the rail, which is the part of the screen
 * that scrolled away first and the part that disappears entirely when the rail
 * is collapsed. A person on a shared machine has to be able to see which
 * account they are on without going looking for it, and Sign Out has to be
 * somewhere it cannot be lost.
 *
 * It opens on click rather than on hover. A hover menu holding a Sign Out is a
 * menu that opens when the pointer crosses the corner on the way to the scroll
 * bar, and it has to be given a click path for touch and a key path for the
 * keyboard anyway, which is two behaviors where one will do. The rail's group
 * flyout opens on hover because it opens onto links; this opens onto a way out.
 *
 * The dropdown mechanics are the ones RecentChanges already uses, deliberately:
 * the same box ref, the same outside click, the same Escape. Two panels in one
 * bar that behave differently is the sort of thing nobody can name but
 * everybody feels.
 */

/** Two letters off the name, the way an office system has always done it. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

const ROW =
  'block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-2)] md:py-2';

export function AccountMenu({
  userName,
  userEmail,
  role,
  signOut,
}: {
  userName: string;
  userEmail: string;
  role: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        // Back to the control that opened it, not to the top of the document.
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Down and up walk the panel, so the menu is usable without a pointer. The
  // items are read out of the DOM rather than held in a list, because one of
  // them is a submit button inside a form and the rest are links.
  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(
      box.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = at === -1 ? 0 : (at + step + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={box} className="relative shrink-0" onKeyDown={onPanelKeyDown}>
      <button
        type="button"
        ref={trigger}
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account, signed in as ${userName}`}
        title={userName}
        className="flex h-11 items-center gap-2 rounded px-1.5 text-white/80 hover:bg-white/10 hover:text-white md:h-9"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/30 text-[11px] font-medium">
          {initials(userName)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-[12px] lg:block">
          {userName}
        </span>
        <NavIcon name="caret" className="hidden md:block" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded border border-[var(--color-rule)] bg-white text-[var(--color-ink)] shadow-lg"
        >
          <div className="border-b border-[var(--color-rule)] px-3 py-2.5">
            <div className="truncate text-sm font-semibold">{userName}</div>
            <div className="truncate text-xs text-[var(--color-ink-3)]">
              {userEmail}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-2)]">
              {roleLabel(role)}
            </div>
          </div>

          <Link
            href="/account"
            data-menu-item
            role="menuitem"
            onClick={() => setOpen(false)}
            className={ROW}
          >
            My Account
          </Link>
          <Link
            href="/account#password"
            data-menu-item
            role="menuitem"
            onClick={() => setOpen(false)}
            className={ROW}
          >
            Change Password
          </Link>
          {/* Offered only where it leads somewhere. Hiding it is a courtesy, and
              the control is the page, which checks the same permission for
              itself. */}
          {can(role, 'user:manage') ? (
            <Link
              href="/users"
              data-menu-item
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ROW}
            >
              Users and Access
            </Link>
          ) : null}

          <form action={signOut} className="border-t border-[var(--color-rule)]">
            <button
              data-menu-item
              role="menuitem"
              className={`${ROW} flex items-center gap-2 font-medium`}
            >
              <NavIcon name="signout" />
              Sign Out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
