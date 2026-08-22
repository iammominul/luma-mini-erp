#!/usr/bin/env node
/**
 * Create (or update) the Interim Billing tables in the database named by
 * DATABASE_URL. The schema is idempotent, so running this again after a change
 * is safe.
 *
 *   pnpm db:setup
 *
 * DATABASE_URL is read from the environment, or from .env.local if it is not
 * set. To point it somewhere else for one run, pass it in:
 *
 *   DATABASE_URL="postgresql://..." pnpm db:setup
 *
 * The production database is migrated by the deploy rather than by hand: see
 * scripts/migrate.mjs. This script is for a local database, and for the first
 * setup of a new environment.
 *
 * Which is why it refuses a remote database unless told outright. The live
 * connection string is one stale shell variable or one wrong dotenv file away
 * at any moment, and this script writes DDL. Setting up a new environment is a
 * real task, so the door is open, but it takes a flag:
 *
 *   DATABASE_URL="postgresql://..." pnpm db:setup --i-know-this-is-remote
 */
import { applySchema, loadEnvFile, isLocalUrl } from './apply-schema.mjs';

loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. Put the connection string in .env.local, or pass it for this run.',
  );
  process.exit(1);
}

if (!isLocalUrl(url) && !process.argv.includes('--i-know-this-is-remote')) {
  // Name the host, never the whole string: a connection string carries the
  // password, and this line goes into a terminal that gets scrolled back
  // through and pasted into messages.
  let host = 'an unparseable URL';
  try {
    host = new URL(url).host;
  } catch {
    // Leave the placeholder. Failing to parse it is not a reason to let it
    // through.
  }
  console.error(
    `Refusing to apply db/schema.sql to ${host}, which is not a database on this machine.\n` +
      'Production is migrated by the deploy (scripts/migrate.mjs), not from here.\n' +
      'If this really is a new environment being set up, pass --i-know-this-is-remote.',
  );
  process.exit(1);
}

try {
  const tables = await applySchema(url);
  console.log(`Done. The database now has ${tables} tables.`);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
