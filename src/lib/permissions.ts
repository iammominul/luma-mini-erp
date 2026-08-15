/**
 * Server-side authorization model, copied from the full ERP's
 * backend/src/auth/permissions.ts and cut down to the screens this app has.
 * Like money.ts and format.ts, this is a copy on purpose: it is pure, it has no
 * imports, and the two apps must agree on what a role means. If the matrix is
 * wrong here, fix it in both.
 *
 * Every protected action calls can(role, permission). The UI never decides
 * access: hiding a button is a courtesy, not a control.
 *
 * The ERP's fourth role, 'store', is deliberately not here. It exists there for
 * fabric and challan entry with no money figures, and every screen in this app
 * is money, so the role would have nothing to do. A store user in the ERP has
 * no counterpart account here.
 */

export type Role = 'owner' | 'accounts' | 'viewer';

export type Permission =
  | 'party:read'
  | 'party:manage'
  | 'bill:read'
  | 'bill:manage'
  | 'settlement:read'
  | 'settlement:manage'
  | 'expense:read'
  | 'expense:manage'
  | 'employee:read'
  | 'employee:manage'
  | 'payroll:read'
  | 'payroll:manage'
  | 'payroll:approve'
  | 'report:read'
  | 'activity:read'
  | 'user:manage';

const READ_ONLY: readonly Permission[] = [
  'party:read',
  'bill:read',
  'settlement:read',
  'expense:read',
  'employee:read',
  'payroll:read',
  'report:read',
];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    ...READ_ONLY,
    'party:manage',
    'bill:manage',
    'settlement:manage',
    'expense:manage',
    'employee:manage',
    'payroll:manage',
    'payroll:approve',
    'activity:read',
    'user:manage',
  ],
  // Accounts runs the book: bills, receipts, expenses, and the payroll month up
  // to the point of approval. Two things are held back.
  //
  // 'payroll:approve' is the Owner's, for the same reason the ERP keeps closing
  // a period out of Accounts' hands: approving a run is the decision that the
  // month's figures are final and the money may go out, and the person who
  // keyed the figures should not also be the person who signs them off.
  // Generating a run, editing a draft line and recording unpaid absence all
  // stay here, so the month is still prepared by Accounts.
  //
  // 'user:manage' is the Owner's because it is the power to grant power.
  accounts: [
    ...READ_ONLY,
    'party:manage',
    'bill:manage',
    'settlement:manage',
    'expense:manage',
    'employee:manage',
    'payroll:manage',
    'activity:read',
  ],
  viewer: READ_ONLY,
};

/** True if the role is allowed the permission. Unknown roles are denied. */
export function can(role: string, permission: Permission): boolean {
  const granted = MATRIX[role as Role] as readonly Permission[] | undefined;
  return granted?.includes(permission) ?? false;
}

/** The roles an Owner may assign, in the order they are offered on screen. */
export const ROLES: readonly Role[] = ['owner', 'accounts', 'viewer'];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Title Case, for menus and the Users screen. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'accounts':
      return 'Accounts';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}

/** What each role is allowed to do, in one line, for the Users screen. */
export function roleDescription(role: Role): string {
  switch (role) {
    case 'owner':
      return 'Everything, including approving payroll and managing users.';
    case 'accounts':
      return 'Bills, receipts, expenses and payroll entry. Cannot approve a payroll run or manage users.';
    case 'viewer':
      return 'Read and print only.';
  }
}
