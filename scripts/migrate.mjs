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
