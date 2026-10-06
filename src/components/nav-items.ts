import { can, type Permission } from '@/lib/permissions';
import type { IconName } from './Icon';

/**
 * What is in the left rail, and which of it a given role is offered.
 *
 * Pure and separate from AppNav.tsx so the filtering can be tested: which
 * entries a role sees is close enough to an access question to be worth a test,
 * even though it is not the control. The control is the page, which checks the
 * same permission for itself in src/lib/session.ts.
 *
 * The full ERP's `11-navigation-and-admin.md` settles the grouping and it is
 * worth quoting, because the obvious thing to build here is the wrong one:
 *
 *   "Six groups, not fifteen modules. The module list is how the system is
 *    built. It is not how it is used, and a menu that mirrors the module list
 *    is the most common navigation failure in enterprise ERP."
 *
 * This rail used to mirror the module list, M0 to M15, with the module code
 * printed against every entry. That is the failure the spec names. The groups
 * below are the ones that file defines, holding only the screens this app has,
 * so somebody who learns where Money Receipts lives here finds it in the same
 * group when the full ERP takes over.
 */

/**
 * `needs` hides an entry a role cannot use. Hiding it is a courtesy so nobody
 * clicks into a 404, and it is never the control: the page behind it checks the
 * same permission for itself in src/lib/session.ts.
 */
export type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  needs?: Permission;
};

export type NavGroup = {
  key: string;
  label: string;
  icon: IconName;
  items: NavItem[];
};

/**
 * Pinned above the groups. The dashboard alone: it is the reason the system is
 * opened, and it belongs to no group.
 *
 * Parties used to be here too, and is now the Master Data group below. Pinning
 * it put a master somebody touches a few times a month above the screens the
 * office opens every day, which is the wrong way round.
 *
 * There was also a Frequent block here, four shortcuts on a tinted strip. It is
 * gone. Its four entries were the first two items of Receivables and Payables,
 * the first two groups, and the group holding the current screen opens itself,
 * so the menu listed the same four screens twice inside one screen height. A
 * fixed list that repeats the menu directly below it is not a shortcut. What
 * earns that block back is favorites somebody pins for themselves, which is
 * what every package that has one actually does.
 */
export const PINNED: (NavItem & { icon: IconName })[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
];

/**
 * Grouped by business function, the way the Bangladesh textile ERPs arrange it
 * (owner, 2026-10-06): Sales, Purchase, Work Orders. That replaced Receivables
 * and Payables, which fitted an app that only billed and stopped fitting once
 * there were orders to raise against both sides.
 *
 * The rule the old split existed for still holds: one side of the book never
 * spreads across groups. Sales is the whole receivable side, from the order to
 * the outstanding; Purchase and Work Orders are the payable side, one for the
 * spinners who sell yarn and one for the knitters and dye houses who work the
 * fabric. Each group runs in the same order, the order first and the
 * outstanding last, so the eye finds the same item in the same place in each.
 *
 * Outstanding stays the short label in all three. Its group heading is directly
 * above it in the rail and printed over its title by Crumb, which is the
 * reasoning recorded when the long labels were reversed on 2026-08-24.
 *
 * Commercial (LC and PI) and Store (challans, phase 2) slot in later as groups
 * of their own.
 */
export const GROUPS: NavGroup[] = [
  {
    key: 'sales',
    label: 'Sales',
    icon: 'receivable',
    items: [
      { href: '/orders', label: 'Sales Orders' },
      { href: '/customers/bills', label: 'Customer Bills' },
      { href: '/customers/settlements', label: 'Money Receipts' },
      { href: '/customers/statement', label: 'Customer Ledger' },
      { href: '/customers', label: 'Outstanding', exact: true },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    icon: 'payable',
    items: [
      { href: '/purchase-orders', label: 'Purchase Orders' },
      { href: '/suppliers/bills', label: 'Supplier Bills' },
      { href: '/suppliers/settlements', label: 'Supplier Payments' },
      { href: '/suppliers/statement', label: 'Supplier Ledger' },
      { href: '/suppliers', label: 'Outstanding', exact: true },
    ],
  },
  {
    key: 'work',
    label: 'Work Orders',
    icon: 'work',
    items: [
      { href: '/work-orders', label: 'Work Orders' },
      { href: '/subcontractors/bills', label: 'Subcontractor Bills' },
      { href: '/subcontractors/settlements', label: 'Subcontractor Payments' },
      { href: '/subcontractors/statement', label: 'Subcontractor Ledger' },
      { href: '/subcontractors', label: 'Outstanding', exact: true },
    ],
  },
  // The three sides above took their ledgers with them, so what is left is the
  // money that belongs to none of them.
  //
  // This group was called Accounts, after the department and after what Tally
  // calls it. Two things were wrong with that. It held Expenses and Expense
  // Claims and nothing else, so Accounts promised a ledger that is not in here,
  // and Accounts is also the name of a role, so a user signed in as Accounts
  // read their own role as a menu heading. Naming it Expenses instead would put
  // an item called Expenses inside a group called Expenses, which is the click
  // that opens onto itself.
  //
  // It was then Cash and Expenses, which said what the two entries had in
  // common: money going out in cash. Loans and the owner's account broke that,
  // because capital introduced and a loan received are money coming in. What
  // all three have in common now is money moving outside the party ledger and
  // outside payroll, in either direction, which is what Cash and Funds says.
  {
    key: 'accounts',
    label: 'Cash and Funds',
    icon: 'books',
    items: [
      { href: '/expenses', label: 'Expenses' },
      { href: '/loans', label: 'Loans', needs: 'fund:read' },
      { href: '/owner', label: "Owner's Account", needs: 'fund:read' },
    ],
  },
  // One group, because a clerk looking for anything about a member of staff
  // looks in one place. The two stay separate everywhere it counts: an employee
  // row and a payroll run are separate tables, a payroll line copies the salary
  // structure rather than reading it, and leave never moves money. See CLAUDE.md
  // section 7. That separation is about the data and the job, not about how many
  // heads a menu of four screens needs.
  {
    key: 'hr',
    label: 'HR and Payroll',
    icon: 'people',
    items: [
      { href: '/employees', label: 'Employees' },
      { href: '/leave', label: 'Leave' },
      { href: '/payroll', label: 'Payroll Runs', exact: true },
      { href: '/payroll/advances', label: 'Salary Advances' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'reports',
    items: [
      { href: '/reports', label: 'Profit Statement', exact: true },
      {
        href: '/reports/cash-flow',
        label: 'Cash Flow',
        needs: 'fund:read',
      },
      { href: '/reports/expenses', label: 'Expense Register' },
      { href: '/reports/orders', label: 'Order Costing' },
    ],
  },
  // The records the transactions above point at, rather than the transactions
  // themselves. Parties is the only one today, and it sits here rather than
  // pinned at the top because a party is set up once and then billed against
  // for months: it is a master, not a daily screen.
  //
  // Fund Accounts sits here on exactly that argument: a partner's capital
  // account and a lender's loan account are opened once and moved against for
  // years, and the balance on each is the outstanding, so the list is the
  // report and there is no second screen for it.
  //
  // Parties is here rather than under Receivables and Payables, which is what
  // Zoho and Odoo do, because splitting it would open the same screen under two
  // names and that is the one thing this menu must never do. Master Data is
  // also where rate charts land if they ever arrive: the ERP's own group is
  // Parties and Rates, and this is that group with the rates not yet built.
  {
    key: 'masters',
    label: 'Setup',
    icon: 'parties',
    items: [{ href: '/parties', label: 'Parties' }],
  },
  {
    key: 'admin',
    label: 'Settings',
    icon: 'admin',
    items: [
      { href: '/users', label: 'Users', needs: 'user:manage' },
      { href: '/audit', label: 'Audit Trail', needs: 'activity:read' },
      { href: '/backup', label: 'Backup' },
    ],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** The groups this role can use, with the entries it cannot dropped. A group
 *  left with nothing in it is dropped too, rather than opening onto blank. */
export function groupsFor(role: string): NavGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.needs || can(role, item.needs)),
  })).filter((group) => group.items.length > 0);
}

/**
 * The name of the group a screen lives in, for the crumb above its title.
 *
 * Read off the whole menu rather than off a role's filtered copy, because this
 * is a label and not an offer: it says where you are on a screen you are
 * already on. A screen outside every group, which today is the dashboard
 * alone, has no crumb and says nothing rather than inventing one.
 */
/**
 * Screens reached by drilling into another screen rather than from the rail.
 *
 * The Cash Book is opened by clicking a line of the Cash Flow, so it is not a
 * menu entry. Without this it would be the one screen in the app with no group
 * printed over its title, because groupLabelFor finds the group by matching the
 * path against the rail and answers null for anything outside it.
 */
const DRILL_DOWNS: { href: string; group: string }[] = [
  { href: '/reports/cash-book', group: 'Reports' },
];

export function groupLabelFor(pathname: string): string | null {
  const drill = DRILL_DOWNS.find((one) => pathname.startsWith(one.href));
  if (drill) return drill.group;

  const found = GROUPS.find((group) =>
    group.items.some((item) => isActive(pathname, item)),
  );
  return found?.label ?? null;
}

export function groupHolding(
  groups: NavGroup[],
  pathname: string,
): string | null {
  const found = groups.find((group) =>
    group.items.some((item) => isActive(pathname, item)),
  );
  return found?.key ?? null;
}
