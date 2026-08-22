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
 * Read KEY=value pairs out of a dotenv file and return them, or null if the
 * file is not there. Nothing is put into process.env.
 *
 * pull-prod.mjs wants the values themselves rather than the merged environment:
 * it has to read the production string out of one named file and can accept no
 * other answer, and process.env may already hold a local one.
 */
export function readEnvFile(name) {
  const file = join(root, name);
  if (!existsSync(file)) return null;

  const values = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return values;
}

/**
 * Read KEY=value pairs out of a dotenv file into process.env, without
 * overwriting anything already set. Later files do not override earlier ones.
 */
export function loadEnvFile(name) {
  const values = readEnvFile(name);
  if (!values) return false;
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key]) continue;
    process.env[key] = value;
  }
  return true;
}

/**
 * Whether a connection string names a database on this machine.
 *
 * Two callers want this for different reasons: connect() picks a driver with
 * it, and setup-db.mjs refuses to write to anything it says no to. One
 * definition, because the two answers have to agree. A script that reads a URL
 * as remote while the driver reads it as local is a script guarding the wrong
 * connection.
 */
export function isLocalUrl(url) {
  return /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
}

/**
 * A query function for either kind of target: the Neon HTTP driver against
 * Neon, node-postgres against a local server. The integration tests and a
 * developer's Docker Postgres are the second case.
 */
async function connect(url) {
  if (!isLocalUrl(url)) return neon(url);

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
