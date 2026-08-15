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
 */
import { applySchema, loadEnvFile } from './apply-schema.mjs';

loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. Put the connection string in .env.local, or pass it for this run.',
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
