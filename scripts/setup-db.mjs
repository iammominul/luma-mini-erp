#!/usr/bin/env node
/**
 * Create (or update) the Interim Billing tables in the Neon database named by
 * DATABASE_URL. The schema is idempotent, so running this again after a change
 * is safe.
 *
 *   pnpm --filter @luma/interim-billing db:setup
 *
 * DATABASE_URL is read from the environment, or from interim-billing/.env.local
 * if it is not set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './split-sql.mjs';

const here = import.meta.dirname;
const root = join(here, '..');

function loadEnvLocal() {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. Put the Neon connection string in interim-billing/.env.local',
  );
  process.exit(1);
}

// Neon in production, plain Postgres when the app is pointed at a local one.
const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(
  url,
);
const sql = isLocal
  ? await (async () => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: url });
      return { query: async (text) => (await pool.query(text)).rows };
    })()
  : neon(url);

const statements = splitSqlStatements(
  readFileSync(join(root, 'db', 'schema.sql'), 'utf8'),
);

console.log(`Applying ${statements.length} statements to the database.`);

for (const [index, statement] of statements.entries()) {
  try {
    await sql.query(statement);
  } catch (error) {
    console.error(`\nStatement ${index + 1} failed:\n${statement}\n`);
    console.error(error.message);
    process.exit(1);
  }
}

const [{ count }] = await sql.query(
  "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
);
console.log(`Done. The database now has ${count} tables.`);
