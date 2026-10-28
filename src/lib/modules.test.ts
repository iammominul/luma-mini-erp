import { describe, expect, it } from 'vitest';
import { groupsFor } from '@/components/nav-items';
import { AUDIENCES, MODULES, canSee, findModule, isAudience } from './modules';

describe('the full ERP module list', () => {
  it('holds the 22 modules of the blueprint, each code once', () => {
    expect(MODULES).toHaveLength(22);
    expect(new Set(MODULES.map((m) => m.code)).size).toBe(22);
    for (const m of MODULES) expect(m.code).toMatch(/^[A-Z]{3}$/);
  });

  it('gives a wave to every module built here and none to one that is not', () => {
    for (const m of MODULES) {
      const builtHere = m.place === 'live' || m.place === 'book';
      expect(m.wave !== null, m.code).toBe(builtHere);
    }
  });

  it('finds a module by its code and nothing by a code it does not have', () => {
    expect(findModule('SUB')?.name).toBe('Sub-Contract Control');
    expect(findModule('XYZ')).toBeUndefined();
  });

  it('knows the three audiences and nothing else', () => {
    expect(AUDIENCES.every(isAudience)).toBe(true);
    expect(isAudience('staff')).toBe(false);
  });
});

describe('who is offered a module', () => {
  it('offers nothing while a module is off or has no switch', () => {
    for (const role of ['owner', 'accounts', 'viewer']) {
      expect(canSee('off', role)).toBe(false);
      expect(canSee(undefined, role)).toBe(false);
    }
  });

  it('offers an owner only module to the owner alone', () => {
    expect(canSee('owner', 'owner')).toBe(true);
    expect(canSee('owner', 'accounts')).toBe(false);
    expect(canSee('owner', 'viewer')).toBe(false);
  });

  it('offers a module switched to everyone to every role', () => {
    for (const role of ['owner', 'accounts', 'viewer']) expect(canSee('everyone', role)).toBe(true);
  });

  it('puts the Modules screen in the rail for the owner only', () => {
    const entries = (role: string) =>
      groupsFor(role).flatMap((group) => group.items.map((item) => item.href));
    expect(entries('owner')).toContain('/modules');
    expect(entries('accounts')).not.toContain('/modules');
    expect(entries('viewer')).not.toContain('/modules');
  });
});
