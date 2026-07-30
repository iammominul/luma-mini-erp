import { neon } from '@neondatabase/serverless';
import { requireEnv } from './env';
import { createPgDriver } from './pg-driver';

/**
 * The database handle.
 *
 * In production this is Neon over HTTP: no pool to manage, which is what a
 * serverless deployment wants. When DATABASE_URL points at localhost it is
 * node-postgres instead, so the app can be run on a laptop against a plain
 * Postgres without a Neon account. Both accept the same tagged-template and
 * transaction() calls, so nothing above this file knows the difference.
 *
 * Two rules hold for every query in this app:
 *   1. Money columns come back as NUMERIC strings and go straight into Money.
 *      Never let a money value become a JS number.
 *   2. Date columns are selected with to_char(...) so they arrive as
 *      'YYYY-MM-DD' text. The default driver would hand back a JS Date built
 *      at the server's midnight, which shifts the day against Asia/Dhaka.
 */

type Driver = ReturnType<typeof neon>;

let localDriver: Driver | null = null;

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
}

export function db(): Driver {
  const url = requireEnv('DATABASE_URL');
  if (!isLocal(url)) return neon(url);

  // One pool for the whole process, unlike the stateless HTTP client.
  localDriver ??= createPgDriver(url, 'public') as unknown as Driver;
  return localDriver;
}
