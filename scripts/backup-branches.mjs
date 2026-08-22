/**
 * Which Neon branches a release may delete.
 *
 * Pure, and its own file, because migrate.mjs runs its work at import time and
 * cannot be loaded from a test. What this returns gets deleted from the project
 * holding the live book, so it is worth proving rather than reading.
 *
 * Two rules, and both are about what it must never return:
 *
 * 1. Only branches named `backup/...`, which is the prefix migrate.mjs creates
 *    under. The primary branch, a preview branch belonging to an open pull
 *    request, and anything a person made by hand are all off limits, and the
 *    prefix is what keeps them off.
 * 2. Never the newest `keep` of them. A restore point exists to be reachable
 *    during the releases just after the one that took it.
 */
export function staleBackups(branches, keep = 5) {
  if (keep < 1) throw new Error('keep must be at least 1.');

  return branches
    .filter((branch) => branch.name?.startsWith('backup/'))
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(keep);
}
