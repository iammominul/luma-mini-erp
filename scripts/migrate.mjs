#!/usr/bin/env node
/**
 * Bring the production database up to db/schema.sql, behind a restore point.
 *
 * Runs from `vercel-build` before `next build`, so the schema is in place
 * before the new code serves anything, and a failure here fails the build
 * rather than putting a half migrated database in front of traffic.
 *
 * It does nothing outside production. A preview deployment gets its own Neon
 * branch, which is already a copy of production and needs no migration of its
 * own, and a local build has no business touching a remote database.
 *
 * ## What this does not make safe
 *
 * Ordering. Vercel keeps the old deployment serving until the new one is built,
 * so between this migration and the cutover the *previous* release is running
 * against the *new* schema. A change that removes something the running code
 * still reads breaks the site for the length of the build.
 *
 * So: expand in one release, contract in a later one. Add a column, ship code
 * that writes it, and only drop the old one once nothing reads it. See the rule
 * in CLAUDE.md. The backup branch below does not prevent that mistake, it only
 * makes it survivable.
 */
import { applySchema, loadEnvFile } from './apply-schema.mjs';
import { staleBackups } from './backup-branches.mjs';

const NEON_API = 'https://console.neon.tech/api/v2';

/** Only production migrates. Anything else says why and stops. */
function shouldRun() {
  const env = process.env.VERCEL_ENV;
  if (!env) {
    console.log('migrate: not a Vercel build, skipping.');
    return false;
  }
  if (env !== 'production') {
    console.log(`migrate: VERCEL_ENV is "${env}", skipping.`);
    return false;
  }
  return true;
}

async function neonRequest(path, key, options = {}) {
  const response = await fetch(`${NEON_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `Neon API ${options.method ?? 'GET'} ${path} returned ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

/** The project to branch. Named outright, or inferred when there is only one. */
async function projectId(key) {
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;

  const { projects } = await neonRequest('/projects', key);
  if (projects.length === 1) return projects[0].id;
  throw new Error(
    `NEON_PROJECT_ID is not set and this API key can see ${projects.length} projects, so which one to branch is ambiguous.`,
  );
}

/**
 * A Neon branch taken before the schema is touched. Copy on write, so it costs
 * almost nothing and is instant, and it is what a bad release is restored from.
 *
 * A failure here fails the build on purpose. The point of the backup is to
 * exist before the migration, so migrating without one is not a smaller version
 * of this deploy, it is a different and worse one.
 */
async function backup(key) {
  const id = await projectId(key);
  const name = `backup/${new Date().toISOString().replace(/[:.]/g, '-')}`;

  await neonRequest(`/projects/${id}/branches`, key, {
    method: 'POST',
    body: JSON.stringify({ branch: { name } }),
  });

  console.log(`migrate: restore point created, Neon branch "${name}".`);
}

/**
 * Delete all but the newest `keep` backup branches.
 *
 * Nothing removed one before this, and the Neon free plan caps how many a
 * project may hold. Left alone, the cap arrives as a failure to create the
 * restore point, which by the rule above fails the build: the deploy that
 * cannot ship a fix is exactly what we were avoiding.
 *
 * Called after backup(), never before, so a failure between the two still
 * leaves the previous release's restore point standing.
 *
 * A delete that will not go through is a warning, not a failure. The restore
 * point for this release has already been taken by the time we get here, which
 * is the part that matters; a branch somebody has protected or branched from is
 * theirs to deal with, not a reason to stop a release.
 */
async function prune(key, keep = 5) {
  const id = await projectId(key);
  const { branches } = await neonRequest(`/projects/${id}/branches`, key);

  // Which ones is decided in backup-branches.mjs, where it is tested. What gets
  // returned here is deleted from the project holding the live book.
  const stale = staleBackups(branches, keep);
  if (stale.length === 0) return;

  for (const branch of stale) {
    try {
      await neonRequest(`/projects/${id}/branches/${branch.id}`, key, {
        method: 'DELETE',
      });
      console.log(`migrate: pruned old restore point "${branch.name}".`);
    } catch (error) {
      console.warn(`migrate: could not prune "${branch.name}": ${error.message}`);
    }
  }
}

if (!shouldRun()) process.exit(0);

loadEnvFile('.env.production.local');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set on this deployment.');
  process.exit(1);
}

const key = process.env.NEON_API_KEY;
if (key) {
  await backup(key);
  // Tidying up is not worth a failed release. backup() above throws on purpose
  // because a migration without a restore point is a different deploy; this one
  // only keeps the branch count down, and next release will try again.
  try {
    await prune(key);
  } catch (error) {
    console.warn(`migrate: could not prune old restore points: ${error.message}`);
  }
} else {
  // Loud, and not fatal. Making this a hard failure would stop every deploy
  // until somebody adds the key, and a deploy that cannot ship a fix is its own
  // kind of risk. Set NEON_API_KEY on the Vercel project to turn it on.
  console.warn(
    'migrate: NEON_API_KEY is not set, so NO RESTORE POINT was created for this release.',
  );
}

try {
  const tables = await applySchema(url);
  console.log(`migrate: schema applied, ${tables} tables.`);
} catch (error) {
  console.error(`\nmigrate: ${error.message}`);
  process.exit(1);
}
