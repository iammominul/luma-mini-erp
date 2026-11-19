import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from './Icon';
import {
  GROUPS,
  PINNED,
  groupHolding,
  groupLabelFor,
  groupsFor,
  isActive,
} from './nav-items';
import { ROLES, can } from '@/lib/permissions';

/**
 * The rail is a courtesy, not the control, but an entry offered to somebody who
 * would only be refused it is still a bug worth catching.
 */

const hrefsFor = (role: string) =>
  groupsFor(role).flatMap((group) => group.items.map((item) => item.href));

describe('groupsFor', () => {
  it('offers Users to an Owner only', () => {
    expect(hrefsFor('owner')).toContain('/users');
    expect(hrefsFor('accounts')).not.toContain('/users');
    expect(hrefsFor('viewer')).not.toContain('/users');
  });

  // Capital, drawings and the loan book are behind 'fund:read', which a Viewer
  // does not hold. Named here rather than left to the generic test above, so
  // moving the permission to the Owner alone breaks a test that says why.
  it('keeps the fund screens away from a Viewer', () => {
    for (const href of ['/loans', '/owner', '/reports/cash-flow']) {
      expect(hrefsFor('owner')).toContain(href);
      expect(hrefsFor('accounts')).toContain(href);
      expect(hrefsFor('viewer')).not.toContain(href);
    }
  });

  it('offers an unknown role nothing that needs a permission', () => {
    const gated = GROUPS.flatMap((group) =>
      group.items.filter((item) => item.needs).map((item) => item.href),
    );
    expect(gated.length).toBeGreaterThan(0);
    for (const href of gated) {
      expect(hrefsFor('store')).not.toContain(href);
    }
  });

  it('never offers an entry the role would be refused', () => {
    for (const role of ROLES) {
      for (const group of groupsFor(role)) {
        for (const item of group.items) {
          if (!item.needs) continue;
          expect(can(role, item.needs), `${role} offered ${item.href}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('drops a group left with nothing in it rather than opening onto blank', () => {
    for (const role of [...ROLES, 'store']) {
      for (const group of groupsFor(role)) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every ungated entry for every role', () => {
    const ungated = GROUPS.flatMap((group) =>
      group.items.filter((item) => !item.needs).map((item) => item.href),
    );
    for (const role of ROLES) {
      for (const href of ungated) {
        expect(hrefsFor(role)).toContain(href);
      }
    }
  });
});

describe('isActive and groupHolding', () => {
  it('matches an exact entry only on itself', () => {
    const dashboard = { href: '/', label: 'Dashboard', exact: true };
    expect(isActive('/', dashboard)).toBe(true);
    expect(isActive('/parties', dashboard)).toBe(false);
  });

  it('matches a prefix entry on its own screens', () => {
    const bills = { href: '/customers/bills', label: 'Customer Bills' };
    expect(isActive('/customers/bills', bills)).toBe(true);
    expect(isActive('/customers/bills/CB-26-0113', bills)).toBe(true);
    expect(isActive('/subcontractors/bills', bills)).toBe(false);
  });

  it('finds the group holding the current screen', () => {
    const groups = groupsFor('owner');
    expect(groupHolding(groups, '/users')).toBe('admin');
    expect(groupHolding(groups, '/customers/bills')).toBe('sales');
    expect(groupHolding(groups, '/orders/SO-26-0001')).toBe('sales');
    expect(groupHolding(groups, '/purchase-orders/PO-26-0001')).toBe('purchase');
    expect(groupHolding(groups, '/work-orders')).toBe('work');
    expect(groupHolding(groups, '/parties')).toBe('masters');
    expect(groupHolding(groups, '/nowhere')).toBeNull();
  });

  // The three Outstanding entries share a label, so the only thing telling
  // them apart is the group. That has to hold, or the short label is a bug.
  it('keeps the three Outstanding entries distinguishable by their group', () => {
    const groups = groupsFor('owner');
    expect(groupHolding(groups, '/customers')).toBe('sales');
    expect(groupHolding(groups, '/suppliers')).toBe('purchase');
    expect(groupHolding(groups, '/subcontractors')).toBe('work');
    expect(groupLabelFor('/customers')).toBe('Sales');
    expect(groupLabelFor('/suppliers')).toBe('Purchase');
    expect(groupLabelFor('/subcontractors')).toBe('Work Orders');
  });

  // One side of the book never spreads across groups (2026-10-06): Sales is
  // the whole receivable side, and each payable lens lives whole in its own.
  it('keeps each side of the book in one group', () => {
    const groups = groupsFor('owner');
    const sides: [string, string][] = [
      ['customers', 'sales'],
      ['suppliers', 'purchase'],
      ['subcontractors', 'work'],
    ];
    for (const [lens, group] of sides) {
      for (const path of [
        `/${lens}/bills`,
        `/${lens}/settlements`,
        `/${lens}/statement`,
        `/${lens}`,
      ]) {
        expect(groupHolding(groups, path), path).toBe(group);
      }
    }
  });

  it('finds no group for a screen this role cannot reach', () => {
    expect(groupHolding(groupsFor('accounts'), '/users')).toBeNull();
  });
});

describe('groupLabelFor', () => {
  it('names the group a screen lives in, for the crumb above its title', () => {
    expect(groupLabelFor('/customers/bills')).toBe('Sales');
    expect(groupLabelFor('/customers/bills/CB-26-0113')).toBe('Sales');
    expect(groupLabelFor('/subcontractors/bills')).toBe('Work Orders');
    expect(groupLabelFor('/suppliers/bills/BR-26-0031')).toBe('Purchase');
    expect(groupLabelFor('/payroll/advances')).toBe('HR and Payroll');
    expect(groupLabelFor('/expenses')).toBe('Cash and Funds');
    expect(groupLabelFor('/loans')).toBe('Cash and Funds');
    expect(groupLabelFor('/owner')).toBe('Cash and Funds');
    expect(groupLabelFor('/parties')).toBe('Setup');
    expect(groupLabelFor('/reports/cash-flow')).toBe('Reports');
    expect(groupLabelFor('/audit')).toBe('Settings');
  });

  // The Cash Book is reached by drilling a Cash Flow line rather than from the
  // rail, so it is the one screen whose crumb cannot come from a menu entry.
  it('names the group for a screen reached by drilling into another', () => {
    expect(groupLabelFor('/reports/cash-book')).toBe('Reports');
  });

  it('says nothing for a screen outside every group', () => {
    // The dashboard is pinned above the groups, and /account and /search are
    // reached from the bar. None of them has a group to name, and a crumb
    // invented for them would be a lie about where the menu puts them.
    expect(groupLabelFor('/')).toBeNull();
    expect(groupLabelFor('/account')).toBeNull();
    expect(groupLabelFor('/search')).toBeNull();
  });

  // The crumb is a label, not an offer. It says where you are on a screen you
  // have already been given, so it does not repeat the permission check.
  it('names the group whatever the role, because it is not an offer', () => {
    expect(groupLabelFor('/users')).toBe('Settings');
  });
});

/**
 * Every mark the rail asks for has to exist. A name that does not match a path
 * in Icon.tsx renders an empty svg: the menu keeps its spacing and simply shows
 * nothing where the mark belongs, which is the kind of fault that survives a
 * review because the screen still looks arranged.
 */
describe('the marks the rail asks for', () => {
  it('are all drawn', () => {
    const asked = [
      ...PINNED.map((item) => item.icon),
      ...GROUPS.map((group) => group.icon),
    ];
    expect(asked.length).toBeGreaterThan(0);
    for (const name of asked) expect(ICON_NAMES).toContain(name);
  });
});
