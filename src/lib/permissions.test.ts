import { describe, expect, it } from 'vitest';
import {
  ROLES,
  can,
  isRole,
  roleDescription,
  roleLabel,
  type Permission,
  type Role,
} from './permissions';

/**
 * The matrix decides who can bill, who can approve a payroll run, and who can
 * grant somebody else those powers, so it is tested the way a money rule is.
 * A change here changes what a role may do: add the case.
 */

const ALL: Permission[] = [
  'party:read',
  'party:manage',
  'bill:read',
  'bill:manage',
  'settlement:read',
  'settlement:manage',
  'expense:read',
  'expense:manage',
  'fund:read',
  'fund:manage',
  'employee:read',
  'employee:manage',
  'payroll:read',
  'payroll:manage',
  'payroll:approve',
  'report:read',
  'activity:read',
  'user:manage',
];

describe('can', () => {
  it('gives an Owner everything', () => {
    for (const permission of ALL) {
      expect(can('owner', permission)).toBe(true);
    }
  });

  it('denies an unknown role everything', () => {
    for (const permission of ALL) {
      expect(can('store', permission)).toBe(false);
      expect(can('', permission)).toBe(false);
      expect(can('OWNER', permission)).toBe(false);
    }
  });

  it('lets Accounts run the book', () => {
    expect(can('accounts', 'bill:manage')).toBe(true);
    expect(can('accounts', 'settlement:manage')).toBe(true);
    expect(can('accounts', 'party:manage')).toBe(true);
    expect(can('accounts', 'expense:manage')).toBe(true);
    expect(can('accounts', 'employee:manage')).toBe(true);
    // Preparing the month is Accounts' job, which is what payroll:manage is.
    expect(can('accounts', 'payroll:manage')).toBe(true);
  });

  it('keeps approving a payroll run away from the person who keyed it', () => {
    expect(can('accounts', 'payroll:approve')).toBe(false);
    expect(can('viewer', 'payroll:approve')).toBe(false);
    expect(can('owner', 'payroll:approve')).toBe(true);
  });

  it('keeps user management to the Owner', () => {
    expect(can('accounts', 'user:manage')).toBe(false);
    expect(can('viewer', 'user:manage')).toBe(false);
    expect(can('owner', 'user:manage')).toBe(true);
  });

  it('lets Accounts write the cash book', () => {
    // Capital, drawings and the loan book are the owner's own position, and
    // there is an argument for holding them back. They are granted because
    // Accounts is the person who writes the cash book, and a Cash Book with the
    // drawings removed shows a running balance that does not add up.
    expect(can('accounts', 'fund:read')).toBe(true);
    expect(can('accounts', 'fund:manage')).toBe(true);
    expect(can('viewer', 'fund:read')).toBe(false);
    expect(can('viewer', 'fund:manage')).toBe(false);
  });

  // The two reads a Viewer does not hold. 'activity:read' is the audit trail,
  // which names who did what; 'fund:read' is the owner's own money and the cash
  // position built on it.
  const NOT_FOR_VIEWER: readonly Permission[] = ['activity:read', 'fund:read'];

  it('gives a Viewer every read and no write', () => {
    for (const permission of ALL) {
      const allowed = can('viewer', permission);
      if (
        permission.endsWith(':read') &&
        !NOT_FOR_VIEWER.includes(permission)
      ) {
        expect(allowed).toBe(true);
      } else {
        expect(allowed).toBe(false);
      }
    }
  });

  it('grants the read alongside every manage it grants', () => {
    // Nobody should be able to change a thing they cannot see. 'user:manage'
    // is the one permission with no read beside it, on purpose: an Owner is
    // the only role that lists users at all, so seeing them and managing them
    // are the same right and a 'user:read' nobody could hold would be dead
    // weight in the matrix.
    for (const role of ROLES) {
      for (const permission of ALL) {
        if (!permission.endsWith(':manage')) continue;
        if (permission === 'user:manage') continue;
        if (!can(role, permission)) continue;
        const read = permission.replace(':manage', ':read') as Permission;
        expect(
          can(role, read),
          `${role} may ${permission} but not ${read}`,
        ).toBe(true);
      }
    }
  });
});

describe('roles', () => {
  it('recognizes only the three roles this app has', () => {
    expect(ROLES).toEqual(['owner', 'accounts', 'viewer']);
    expect(isRole('owner')).toBe(true);
    // The ERP's fourth role has no counterpart here.
    expect(isRole('store')).toBe(false);
    expect(isRole('')).toBe(false);
  });

  it('labels every role in Title Case and describes each one', () => {
    expect(ROLES.map(roleLabel)).toEqual(['Owner', 'Accounts', 'Viewer']);
    for (const role of ROLES) {
      expect(roleDescription(role as Role).length).toBeGreaterThan(0);
    }
  });
});
