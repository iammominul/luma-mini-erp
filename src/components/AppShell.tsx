'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';
import { AppNav } from './AppNav';
import { Icon } from './Icon';
import { RecentChanges } from './RecentChanges';
import { SearchBox } from './SearchBox';
import { useIsWide } from './use-is-wide';
import type { ActivityEntry } from '@/lib/types';

/**
 * The frame every screen sits in.
 *
 * At `md` and up it is the approved prototype's shell: one viewport height
 * grid, the bar across the top of it, the rail under the bar on the left, and
 * the work area beside the rail. Only the work area scrolls. The rail used to
 * be an ordinary flex sibling in a page that scrolled as one piece, which meant
 * the menu and the search box left the screen on any list longer than a
 * screenful, which is most of them.
 *
 * Below `md` none of that applies: the rail at 360px takes two thirds of the
 * width, so it is a drawer over the page and the bar is sticky rather than
 * fixed. Every grid class below is written with an `md:` prefix for that
 * reason, and the drawer, its backdrop, its focus trap and its scroll lock are
 * untouched by the geometry above them.
 *
 * This is a client component only because the drawer and the rail width have
 * state. `children` is passed straight through as a slot, so every page inside
 * it stays a server component and nothing about the data path changes.
 */

/** What a browser will move focus to, for the trap below. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Remembered, because a clerk who wants the width back wants it back tomorrow. */
const COLLAPSED_KEY = 'luma_nav_collapsed';

export function AppShell({
  companyName,
  signOut,
  userName,
  userEmail,
  role,
  recent,
  children,
}: {
  companyName: string;
  signOut: () => Promise<void>;
  userName: string;
  userEmail: string;
  role: string;
  /** The newest activity rows, or null for a role that may not read the log. */
  recent: ActivityEntry[] | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isWide = useIsWide();
  const [open, setOpen] = useState(false);

  // The rail's width lives here rather than in AppNav, because the grid column
  // above has to be sized from it and a parent cannot read a child's state.
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount, so the server render and the first client render agree.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  // Navigating closes the drawer. A tap on a link to the screen already
  // showing does not change the path, so AppNav closes on the tap itself as
  // well; this covers every other case, including the back button.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Widening to the rail leaves nothing to close, so the drawer does not stay
  // half remembered behind it.
  useEffect(() => {
    if (isWide) setOpen(false);
  }, [isWide]);

  // Escape closes it, and focus goes back to the control that opened it rather
  // than to the top of the document.
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) openerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;

    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      // The drawer covers the page, so tabbing has to stay inside it. Anything
      // behind it is inert and would take focus somewhere invisible.
      const stops = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (stops.length === 0) return;

      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // The page behind the drawer must not scroll under it. This holds because
  // globals.css gives html and body a height, so hiding the overflow clips at
  // the viewport rather than at the document.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const drawer = open && !isWide;
  // The rail is only ever narrow at md and up. Below that the same menu is a
  // drawer and always shows its labels, whatever was left at the desk.
  const rail = collapsed && isWide;

  return (
    <div
      data-app-shell
      className={`flex min-h-screen flex-col md:grid md:h-screen md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] ${
        // 56px rather than 3.5rem, which is the same width and is a class
        // Tailwind actually generates. It does not generate the decimal form
        // in front of the minmax, and it says nothing about refusing: the rule
        // is simply absent from the stylesheet and the rail keeps its full
        // width with no error anywhere. Checked in the built CSS, not assumed.
        rail
          ? 'md:grid-cols-[56px_minmax(0,1fr)]'
          : 'md:grid-cols-[15rem_minmax(0,1fr)]'
      }`}
    >
      {drawer ? (
        <div
          data-app-chrome
          aria-hidden="true"
          onClick={close}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      ) : null}

      {/* Three zones: the mark, the search, and the account and change log.

          The bar spans both columns and sits above the rail, so the mark lines
          up with the rail's own edge. At md the outer columns are the same
          width, which is what puts the search at the true center of the screen
          rather than at the center of whatever room the two ends left it.
          Below md there are no columns: the hamburger takes the mark's place
          and the search takes the rest, because a phone has no room to name the
          company on every screen. */}
      <header
        data-app-chrome
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--color-navy-3)] bg-[var(--color-navy)] px-2 py-2 text-white md:col-span-2 md:static md:grid md:h-11 md:grid-cols-[15rem_minmax(0,1fr)_15rem] md:gap-3 md:px-3 md:py-0"
      >
        <button
          type="button"
          ref={openerRef}
          onClick={() => setOpen(true)}
          aria-label="Open the menu"
          aria-controls="app-nav"
          aria-expanded={open}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white md:hidden"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>

        {/* The symbol and the name, sized to the rail column so the two edges
            agree. It holds its width when the rail collapses: a mark that moves
            when the menu narrows reads as a different screen.

            The mark is a plain img rather than an inline SVG. It is a brand
            asset somebody replaces, the same way the letterhead is replaced,
            and a file swapped on disk should not need a component edited. */}
        <div className="hidden min-w-0 items-center gap-2.5 md:flex">
          <img
            src="/brand-mark.svg"
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-[26px] shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight tracking-wide">
              {companyName}
            </span>
            <span className="block text-[9.5px] uppercase leading-tight tracking-[0.12em] text-white/50">
              Interim Billing
            </span>
          </span>
        </div>

        {/* Centered in its column, and capped. Left to fill the column it ran
            most of a wide screen, which is a lot of box for a bill number. */}
        <SearchBox className="min-w-0 flex-1 md:mx-auto md:w-full md:max-w-[26rem] md:flex-none" />

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 md:justify-end md:gap-2">
          {recent ? <RecentChanges entries={recent} /> : null}
          <AccountMenu
            userName={userName}
            userEmail={userEmail}
            role={role}
            signOut={signOut}
          />
        </div>
      </header>

      <AppNav
        companyName={companyName}
        role={role}
        drawerOpen={open}
        isWide={isWide}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onClose={close}
        panelRef={panelRef}
      />

      {/* At md this is the only thing on the screen that scrolls, which is what
          keeps the bar and the rail still. It is also the scroll container the
          sticky table headings and the screen head now attach to.

          overflow-x-auto stays until every wide screen has a narrow layout of
          its own. Once they do it should never engage, and a sideways
          scrollbar here is then worth treating as a fault, not a layout. */}
      {/* No top padding at md, and that is deliberate. The screen head pins to
          the top of this box, and a sticky child cannot reach above its own
          container's padding: leave 20px of padding here and the head pins 20px
          down, with rows scrolling up through the strip above it. So the space
          above a title belongs to the head, which paints it, and this keeps
          only the sides and the foot. A screen with no PageTitle sets its own,
          which is the three record views under [side]. */}
      <main className="min-w-0 flex-1 overflow-x-auto px-4 py-4 md:overflow-auto md:px-6 md:pb-6 md:pt-0">
        {children}
      </main>
    </div>
  );
}
