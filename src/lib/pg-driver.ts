import { Pool } from 'pg';

/**
 * A stand-in for the Neon HTTP driver, backed by node-postgres.
 *
 * Neon speaks its own HTTP protocol, so the real driver cannot talk to a plain
 * Postgres. This shim accepts the same tagged-template and transaction() calls,
 * which lets the integration test run every SQL statement in the app against a
 * local Postgres before any of it reaches production. Test-only: nothing under
 * src/app imports this file.
 */

type Run = (
  text: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>;

export type LazyQuery = {
  text: string;
  params: unknown[];
  then: (
    onFulfilled: (rows: Record<string, unknown>[]) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};

function lazy(text: string, params: unknown[], run: Run): LazyQuery {
  return {
    text,
    params,
    then: (onFulfilled, onRejected) =>
      run(text, params).then(onFulfilled, onRejected),
  };
}

export function createPgDriver(connectionString: string, schema: string) {
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
    max: 4,
  });

  const run: Run = async (text, params) =>
    (await pool.query(text, params)).rows as Record<string, unknown>[];

  const sql = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce(
      (acc, part, index) =>
        acc + part + (index < params.length ? `$${index + 1}` : ''),
      '',
    );
    return lazy(text, params, run);
  };

  /** Neon runs a batch as one non-interactive transaction; so does this. */
  sql.transaction = async (queries: LazyQuery[]) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results: Record<string, unknown>[][] = [];
      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result.rows as Record<string, unknown>[]);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  sql.query = (text: string, params: unknown[] = []) => run(text, params);
  sql.end = () => pool.end();

  return sql;
}

export type PgDriver = ReturnType<typeof createPgDriver>;
