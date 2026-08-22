import { describe, expect, it } from 'vitest';
import { staleBackups, type NeonBranch } from './backup-branches.mjs';

/**
 * Every branch this returns is deleted from the Neon project holding the live
 * book, so the cases that matter are the ones about what it leaves alone.
 */
function branch(name: string, created_at: string): NeonBranch {
  return { id: name, name, created_at };
}

describe('staleBackups', () => {
  const backups = [
    branch('backup/2026-08-01', '2026-08-01T10:00:00Z'),
    branch('backup/2026-08-02', '2026-08-02T10:00:00Z'),
    branch('backup/2026-08-03', '2026-08-03T10:00:00Z'),
    branch('backup/2026-08-04', '2026-08-04T10:00:00Z'),
    branch('backup/2026-08-05', '2026-08-05T10:00:00Z'),
    branch('backup/2026-08-06', '2026-08-06T10:00:00Z'),
    branch('backup/2026-08-07', '2026-08-07T10:00:00Z'),
  ];

  it('keeps the newest five and returns the rest', () => {
    expect(staleBackups(backups).map((b) => b.name)).toEqual([
      'backup/2026-08-02',
      'backup/2026-08-01',
    ]);
  });

  it('returns nothing while five or fewer exist', () => {
    expect(staleBackups(backups.slice(0, 5))).toEqual([]);
    expect(staleBackups(backups.slice(0, 3))).toEqual([]);
    expect(staleBackups([])).toEqual([]);
  });

  it('never returns a branch that is not a backup', () => {
    const others = [
      branch('main', '2020-01-01T00:00:00Z'),
      branch('production', '2020-01-01T00:00:00Z'),
      branch('preview/pr-12', '2020-01-01T00:00:00Z'),
      branch('before-the-book-reload', '2020-01-01T00:00:00Z'),
    ];
    // Every one of these is older than every backup, so a prune that sorted by
    // date without filtering by name first would take the primary branch out.
    expect(staleBackups([...others, ...backups])).toEqual(
      staleBackups(backups),
    );
  });

  it('reads the newest by date, not by the order the API listed them', () => {
    const shuffled = [backups[3], backups[6], backups[0], backups[5]];
    expect(staleBackups(shuffled, 2).map((b) => b.name)).toEqual([
      'backup/2026-08-04',
      'backup/2026-08-01',
    ]);
  });

  it('leaves the caller its input untouched', () => {
    const given = backups.slice();
    staleBackups(given);
    expect(given).toEqual(backups);
  });

  it('refuses to keep nothing', () => {
    // keep: 0 would delete the restore point this very release just took.
    expect(() => staleBackups(backups, 0)).toThrow();
  });
});
