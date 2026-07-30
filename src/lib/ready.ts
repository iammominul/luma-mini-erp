import { schemaReady } from './queries';

export type Readiness = { ok: true } | { ok: false; message: string };

/**
 * Is the app configured and the schema applied? Checked once in the app layout
 * so a fresh deployment shows the two remaining setup steps instead of a stack
 * trace.
 */
export async function checkReady(): Promise<Readiness> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      message:
        'DATABASE_URL is not set. Add the Neon connection string to the environment and redeploy.',
    };
  }
  try {
    if (!(await schemaReady())) {
      return {
        ok: false,
        message:
          'The database is reachable but the tables are not created yet. Run "pnpm db:setup" in the interim-billing folder with DATABASE_URL set.',
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach the database: ${(error as Error).message}`,
    };
  }
}
