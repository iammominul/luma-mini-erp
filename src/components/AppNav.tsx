'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Ref } from 'react';
import { Icon } from './Icon';
import { PINNED, groupHolding, groupsFor, isActive } from './nav-items';

/**
 * The left rail. What is in it, and which entries a role is offered, live in
 * nav-items.ts; this file is the behavior.
 *
 * That behavior comes from the full ERP's `11-navigation-and-admin.md`: the
 * dashboard is pinned above the groups and is never behind a click, a group
 * opens on click and stays open, the group holding the current screen opens
 * itself, and the rail collapses to marks with the groups opening on hover. A
 * collapsed group is collapsed, not removed, so nothing is reachable only by
 * knowing it is there.
 *
 * At `md` and up this is the second cell of the shell grid: the bar sits above
 * it, the column sizes it, and it scrolls on its own so a long menu never takes
 * the page with it. Below `md` the same menu is a drawer over the page, opened
 * from the bar in AppShell. The collapsed rail does not exist there, and `rail`
 * below is what holds the two apart: a narrow screen always renders the full
 * labeled menu, whatever the desktop preference is. That is not only about
 * width. Collapsing drops the labels and the group names from the tree
 * entirely, so a clerk who left the rail collapsed at their desk would open the
 * drawer on a phone to a column of unlabeled marks.
 *
 * The account and the way out are not here. They live in the bar, where they
 * are on screen whatever the page is doing, and putting a Sign Out in two
 * places would be two things to keep in step for no gain.
 */

// Roomier in the drawer, where it is tapped, and back to the dense rail at md.
const ITEM = 'block border-l-2 py-3 text-sm md:py-1.5 md:text-[12.5px]';

const ON = 'border-white bg-[var(--color-navy-2)] font-medium text-white';
const OFF = 'border-transparent text-white/75 hover:bg-white/5 hover:text-white';

export function AppNav({
  companyName,
  role,
  drawerOpen,
  isWide,
  collapsed,
  onToggleCollapsed,
  onClose,
  panelRef,
}: {
  companyName: string;
  role: string;
  /** Whether the drawer is showing. Means nothing at `md` and up. */
  drawerOpen: boolean;
  isWide: boolean;
  /** The desktop preference. Held in AppShell, which sizes the grid from it. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  panelRef: Ref<HTMLElement>;
}) {
  const pathname = usePathname();
  const groups = groupsFor(role);
  const current = groupHolding(groups, pathname);

  // Which group the pointer is over while the rail is collapsed.
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The group holding the current screen is open unless it has been closed by
  // hand, so the menu always shows where you are.
  const isOpen = (key: string) => open[key] ?? key === current;

  // Marks only, no labels. A narrow screen never does this, however the rail
  // was left at the desk.
  const rail = collapsed && isWide;
  // Showing as a drawer over the page rather than as a rail beside it.
  const asDrawer = drawerOpen && !isWide;

  // Collapsed, the rail stops scrolling on purpose: eight marks fit any screen,
  // and a box that scrolls clips the flyout opening beside it, which is the one
  // thing collapsing is for.
  return (
    <aside
      id="app-nav"
      ref={panelRef}
      tabIndex={-1}
      data-app-chrome
      inert={!drawerOpen && !isWide}
      role={asDrawer ? 'dialog' : undefined}
      aria-modal={asDrawer || undefined}
      aria-label={asDrawer ? 'Main Menu' : undefined}
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-navy-3)] bg-[var(--color-navy)] text-white outline-none transition-transform duration-200 md:static md:z-auto md:h-full md:w-auto md:translate-x-0 ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      } ${rail ? 'md:overflow-visible' : 'md:overflow-y-auto'}`}
    >
      {/* The company is named in the bar at md, so this head is the drawer's
          own and goes with it. Collapsing is the rail's control and means
          nothing in a drawer; below md its place is taken by the way out.
          Escape closes the drawer too, but a way out has to be visible as well
          as known. */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3 md:hidden">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-wide">
            {companyName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the menu"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      {/* A tap on a link closes the drawer. The path effect in AppShell misses
          the link to the screen already showing, which is the one that would
          otherwise leave the drawer sitting open over it. */}
      <nav
        className="py-2"
        aria-label="Main"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) onClose();
        }}
      >
        {PINNED.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={rail ? item.label : undefined}
            className={`flex items-center gap-2.5 ${ITEM} ${
              rail ? 'justify-center px-0' : 'px-3.5'
            } ${isActive(pathname, item) ? ON : OFF}`}
          >
            <Icon name={item.icon} />
            {rail ? null : <span>{item.label}</span>}
          </Link>
        ))}

        {/* A rule between the dashboard and the groups. It used to be a tinted
            block of four shortcuts; see the note in nav-items.ts for why that
            went. */}
        <div className="my-1.5 border-b border-[var(--color-navy-3)]" />

        {groups.map((group) => {
          const expanded = rail ? hovered === group.key : isOpen(group.key);
          const holdsCurrent = current === group.key;

          return (
            <div
              key={group.key}
              className="relative"
              onMouseEnter={() => rail && setHovered(group.key)}
              onMouseLeave={() => rail && setHovered(null)}
            >
              <button
                type="button"
                onClick={() =>
                  rail
                    ? onToggleCollapsed()
                    : setOpen((was) => ({
                        ...was,
                        [group.key]: !isOpen(group.key),
                      }))
                }
                aria-expanded={expanded}
                title={rail ? group.label : undefined}
                className={`flex w-full items-center gap-2.5 border-l-2 py-3 text-sm md:py-1.5 ${
                  rail ? 'justify-center px-0' : 'px-3.5'
                } ${
                  holdsCurrent
                    ? 'border-white/60 text-white'
                    : 'border-transparent text-white/75'
                } hover:bg-white/5 hover:text-white`}
              >
                <Icon name={group.icon} />
                {rail ? null : (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <span
                      className={`text-white/40 transition-transform duration-150 ${
                        expanded ? 'rotate-90' : ''
                      }`}
                    >
                      <Icon name="chevron" />
                    </span>
                  </>
                )}
              </button>

              {/* Collapsed, the group opens beside the rail rather than pushing
                  it wider, so the marks stay where the pointer expects them. */}
              {expanded && rail ? (
                <div className="absolute left-full top-0 z-20 ml-1 w-52 rounded border border-white/15 bg-[var(--color-navy)] py-1 shadow-lg">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${ITEM} px-3 ${
                        isActive(pathname, item) ? ON : OFF
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}

              {expanded && !rail
                ? group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${ITEM} pl-11 pr-3 ${
                        isActive(pathname, item) ? ON : OFF
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))
                : null}
            </div>
          );
        })}
      </nav>

      {/* The width control, at the foot where it is out of the way of the
          screens. It is desktop only: a drawer has one width and closes. */}
      <div className="mt-auto hidden border-t border-white/10 p-2 md:block">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={rail ? 'Expand the menu' : 'Collapse the menu'}
          aria-expanded={!rail}
          title={rail ? 'Expand the menu' : 'Collapse the menu'}
          className={`flex w-full items-center gap-2.5 rounded py-1.5 text-[12px] text-white/60 hover:bg-white/10 hover:text-white ${
            rail ? 'justify-center px-0' : 'px-2'
          }`}
        >
          <Icon name={rail ? 'expand' : 'collapse'} />
          {rail ? null : <span>Collapse Menu</span>}
        </button>
      </div>
    </aside>
  );
}
