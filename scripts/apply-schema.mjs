/**
 * Apply db/schema.sql to a database.
 *
 * Shared by setup-db.mjs, which a person runs, and migrate.mjs, which the
 * production build runs. One implementation, because the thing a release
 * applies to production has to be exactly the thing that was tried locally.
 *
 * The schema is idempotent and every migration in it is guarded, so applying it
 * again when nothing has changed is a no-op.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './split-sql.mjs';

const root = join(import.meta.dirname, '..');

/**
 * Read KEY=value pairs out of a dotenv file into process.env, without
 * overwriting anything already set. Later files do not override earlier ones.
 */
export function loadEnvFile(name) {
  const file = join(root, name);
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return true;
}

/**
 * A query function for either kind of target: the Neon HTTP driver against
 * Neon, node-postgres against a local server. The integration tests and a
 * developer's Docker Postgres are the second case.
 */
async function connect(url) {
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(
    url,
  );
  if (!isLocal) return neon(url);

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  return { query: async (text) => (await pool.query(text)).rows };
}

/**
 * Apply every statement in db/schema.sql. Throws on the first failure, naming
 * the statement, because a half applied schema is the thing worth shouting
 * about: in the production build this failure is what stops a bad schema change
 * reaching traffic.
 */
export async function applySchema(url) {
  const sql = await connect(url);
  const statements = splitSqlStatements(
    readFileSync(join(root, 'db', 'schema.sql'), 'utf8'),
  );

  console.log(`Applying ${statements.length} statements to the database.`);

  for (const [index, statement] of statements.entries()) {
    try {
      await sql.query(statement);
    } catch (error) {
      throw new Error(
        `Statement ${index + 1} failed:\n${statement}\n\n${error.message}`,
      );
    }
  }

  const [{ count }] = await sql.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  return count;
}
