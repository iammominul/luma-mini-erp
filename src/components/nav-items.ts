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
 * Six groups, and which side of the book a screen belongs to decides the first
 * two of them.
 *
 * The full ERP's `11-navigation-and-admin.md` puts both sides in one Money
 * group. This app deliberately does not, and the divergence was taken with the
 * reason on the record: every package an accounts clerk in this market has used
 * splits the receivable side from the payable side, SAP calls them Sales A/R
 * and Purchasing A/P, Odoo and Zoho call them Sales and Purchases, and this app
 * is two sides before it is anything else. A bill raised and a bill received
 * are not two rows of one list, they are opposite directions of money, and one
 * Money group asks somebody to read the item label to work out which way a
 * screen points. If the ERP is ever made to agree, this is the shape to move
 * to, not the other way around.
 *
 * A group holds the whole of one side: what was billed, what was settled, the
 * ledger it lands in, and what is left outstanding.
 */
export const GROUPS: NavGroup[] = [
  {
    key: 'receivables',
    label: 'Receivables',
    icon: 'receivable',
    items: [
      { href: '/customers/bills', label: 'Customer Bills' },
      { href: '/customers/settlements', label: 'Money Receipts' },
      { href: '/customers/statement', label: 'Customer Ledger' },
      // Named for the side it reports, not just 'Outstanding'. The two sides
      // each have one, and inside its group the short label read fine while
      // anywhere the group name is missing, in search or in the collapsed
      // flyout, the two were the same word twice.
      { href: '/customers', label: 'Customer Outstanding', exact: true },
    ],
  },
  {
    key: 'payables',
    label: 'Payables',
    icon: 'payable',
    items: [
      { href: '/subcontractors/bills', label: 'Bills Received' },
      { href: '/subcontractors/settlements', label: 'Payments Made' },
      { href: '/subcontractors/statement', label: 'Subcontractor Ledger' },
      { href: '/subcontractors', label: 'Subcontractor Outstanding', exact: true },
    ],
  },
  // The two sides above took their ledgers with them, so what is left is the
  // money that belongs to neither: what the business spent.
  //
  // This group was called Accounts, after the department and after what Tally
  // calls it. Two things were wrong with that. It holds Expenses and Expense
  // Claims and nothing else, so Accounts promised a ledger that is not in here,
  // and Accounts is also the name of a role, so a user signed in as Accounts
  // read their own role as a menu heading. Naming it Expenses instead would put
  // an item called Expenses inside a group called Expenses, which is the click
  // that opens onto itself, so it says what both entries have in common: money
  // going out in cash.
  {
    key: 'accounts',
    label: 'Cash and Expenses',
    icon: 'books',
    items: [
      { href: '/expenses', label: 'Expenses' },
      { href: '/claims', label: 'Expense Claims' },
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
      { href: '/reports/expenses', label: 'Expense Register' },
      { href: '/reports/orders', label: 'Order Costing' },
    ],
  },
  // The records the transactions above point at, rather than the transactions
  // themselves. Parties is the only one today, and it sits here rather than
  // pinned at the top because a party is set up once and then billed against
  // for months: it is a master, not a daily screen.
  //
  // It is a group of one on purpose. The obvious alternative was to put
  // Customers under Receivables and Subcontractors under Payables, which is
  // what Zoho and Odoo do, but both would open the same screen under two names
  // and that is the one thing this menu must never do. Master Data is also
  // where rate charts land if they ever arrive: the ERP's own group is Parties
  // and Rates, and this is that group with the rates not yet built.
  {
    key: 'masters',
    label: 'Master Data',
    icon: 'parties',
    items: [{ href: '/parties', label: 'Parties' }],
  },
  {
    key: 'admin',
    label: 'Administration',
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
export function groupLabelFor(pathname: string): string | null {
  const found = GROUPS.find((group) =>
    group.items.some((item) => isActive(pathname, item)),
  );
  return found?.label ?? null;
}

export function groupHolding(groups: NavGroup[], pathname: string): string | null {
  const found = groups.find((group) =>
    group.items.some((item) => isActive(pathname, item)),
  );
  return found?.key ?? null;
}
