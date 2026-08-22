#!/usr/bin/env node
/**
 * Copy the production book into the local Docker Postgres.
 *
 *   pnpm db:up && pnpm db:pull
 *
 * Read only against production: it runs pg_dump and nothing else, and every
 * write it makes is to interim_dev on this machine. What it destroys is the
 * local database, which is the point of it.
 *
 * ## Why it goes through the container
 *
 * There is no pg_dump or psql on the host PATH, and installing one invites the
 * version skew the docker-compose.yml comment describes: a Postgres 18 dump
 * carries settings and psql meta-commands that older clients reject outright.
 * The db service is postgres:18, the same major version Neon runs, and carries
 * both tools. So the dump is taken by the same version that will read it back.
 *
 * ## Why it restores production's schema rather than db/schema.sql
 *
 * What lands here is production's actual shape, tables, columns, indexes and
 * all, not this repository's idea of it. Running `pnpm db:setup` afterwards
 * then applies db/schema.sql on top, which is exactly what scripts/migrate.mjs
 * does to production on deploy. Those two steps in that order are the migration
 * rehearsal, and they are the only thing that catches a guarded migration that
 * is fine against an empty database and wrong against real rows.
 *
 * ## What it deliberately leaves behind
 *
 * Session rows. They are signed against the production AUTH_SECRET and mean
 * nothing here, and a laptop is not where live sessions belong. Sign in locally
 * with the same account and password: the user rows and their credentials do
 * come across, because an app whose every screen is behind a login is not
 * testable without them.
 *
 * Both dumps land in backups/, which is gitignored: the production one, and a
 * copy of the local database taken before it is replaced. They hold every
 * figure in the book in clear text. Delete them when you are finished.
 */
import { spawn } from 'node:child_process';
import { closeSync, createWriteStream, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { readEnvFile, isLocalUrl } from './apply-schema.mjs';

const root = join(import.meta.dirname, '..');

/** The local target. Never interim_test, which the integration tests own. */
const LOCAL_DB = 'interim_dev';
const LOCAL_USER = 'luma';

/** Row data not worth carrying off production. The tables still come across. */
const SKIP_DATA = ['sessions', 'verifications'];

function fail(message) {
  console.error(`\ndb:pull: ${message}`);
  process.exit(1);
}

/** Host only. A connection string carries a password and this goes on screen. */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'an unparseable URL';
  }
}

/**
 * Run a command with its output on this terminal, resolving with the exit code.
 * `stdout` redirects standard output to a stream, for a dump. `stdinFile` feeds
 * a file in, for the restore, and is opened here rather than passed as a
 * stream: a stdio entry has to be a real descriptor, and a fresh ReadStream has
 * not opened its file yet.
 */
function run(command, args, { stdout, stdinFile } = {}) {
  const fd = stdinFile ? openSync(stdinFile, 'r') : null;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: [fd ?? 'ignore', stdout ? 'pipe' : 'inherit', 'inherit'],
    });
    if (stdout) child.stdout.pipe(stdout);
    child.on('error', reject);
    child.on('close', (code) => {
      if (fd !== null) closeSync(fd);
      resolve(code ?? 1);
    });
  });
}

/** Run a command and give back what it wrote, for the checks and the counts. */
function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

/** psql inside the container, against the local database. */
function psql(args, options) {
  return run(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', LOCAL_USER, '-d', LOCAL_DB, ...args],
    options,
  );
}

/**
 * The production connection string, from PROD_DATABASE_URL or from the one
 * named file. Never from process.env.DATABASE_URL: that is whatever the shell
 * or .env.local is pointing at, and reading it here is how a "pull" turns into
 * a dump of the local database over the top of itself.
 */
function productionUrl() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;

  const values = readEnvFile('.env.production.local');
  if (!values?.DATABASE_URL) {
    fail(
      'No production connection string. Put DATABASE_URL in .env.production.local, or pass PROD_DATABASE_URL for this run.',
    );
  }
  return values.DATABASE_URL;
}

/**
 * The direct endpoint, and sslmode set.
 *
 * Neon's pooled host is the same name with "-pooler" in it, and a long single
 * connection doing a full dump is the case pgbouncer handles worst. The app
 * wants the pooler; pg_dump wants the endpoint behind it.
 */
function forDump(url) {
  const parsed = new URL(url);
  parsed.host = parsed.host.replace('-pooler', '');
  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

/** The container has to be up, or every later step fails obscurely. */
async function requireContainer() {
  const { code, out } = await capture('docker', [
    'compose',
    'ps',
    '--status',
    'running',
    '--format',
    '{{.Service}}',
  ]);
  if (code !== 0) fail('docker compose is not answering. Is Docker running?');
  if (!out.split('\n').some((line) => line.trim() === 'db')) {
    fail('The local Postgres is not running. Start it with: pnpm db:up');
  }
}

const url = productionUrl();
if (isLocalUrl(url)) {
  fail(
    `The connection string names ${hostOf(url)}, which is a database on this machine. ` +
      'There is nothing to pull: check .env.production.local.',
  );
}

await requireContainer();

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace('T', '-')
  .slice(0, 15);
const dumpPath = join(root, 'backups', `prod-${stamp}.sql`);
mkdirSync(join(root, 'backups'), { recursive: true });

console.log(`db:pull: dumping ${hostOf(forDump(url))}`);

// Dump first, restore second. If the dump fails there is nothing to restore and
// the local database is left exactly as it was, which is the right way round.
const file = createWriteStream(dumpPath);
const dumped = await run(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'pg_dump',
    '--no-owner',
    '--no-privileges',
    ...SKIP_DATA.map((table) => `--exclude-table-data=${table}`),
    forDump(url),
  ],
  { stdout: file },
);
await new Promise((resolve) => file.close(resolve));

if (dumped !== 0) fail(`pg_dump exited ${dumped}. Nothing local was touched.`);
console.log(`db:pull: written to backups/prod-${stamp}.sql`);

// Keep what is being replaced. interim_dev is a scratch database in principle,
// but in practice it accumulates the half-finished test cases somebody built an
// afternoon around, and this script drops the whole schema. The copy costs a
// second and a megabyte.
const localPath = join(root, 'backups', `local-before-pull-${stamp}.sql`);
const localFile = createWriteStream(localPath);
const savedLocal = await run(
  'docker',
  ['compose', 'exec', '-T', 'db', 'pg_dump', '--no-owner', '--no-privileges', '-U', LOCAL_USER, LOCAL_DB],
  { stdout: localFile },
);
await new Promise((resolve) => localFile.close(resolve));
if (savedLocal !== 0) {
  fail(
    `Could not save the current ${LOCAL_DB} first, so it has not been replaced.\n` +
      `The production dump is kept at backups/prod-${stamp}.sql.`,
  );
}
console.log(`db:pull: previous ${LOCAL_DB} saved to backups/local-before-pull-${stamp}.sql`);

console.log(`db:pull: replacing ${LOCAL_DB} on localhost:5434`);
if ((await psql(['-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'])) !== 0) {
  fail(`Could not clear ${LOCAL_DB}. The dump is kept at backups/prod-${stamp}.sql.`);
}

// -o discards the result tables. A dump calls set_config and setval as ordinary
// SELECTs, so a restore that says nothing otherwise still prints a dozen little
// one-row tables and buries anything worth reading. Errors are on stderr and
// still come through.
const restored = await psql(['-v', 'ON_ERROR_STOP=1', '-q', '-o', '/dev/null'], {
  stdinFile: dumpPath,
});
if (restored !== 0) {
  fail(
    `The restore failed and ${LOCAL_DB} is now half loaded. Fix the cause, then run this again.`,
  );
}

// Say what landed. An empty database restores without error, and a silent
// success is indistinguishable from one until somebody opens the app.
const counts = await capture(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    LOCAL_USER,
    '-d',
    LOCAL_DB,
    '-t',
    '-c',
    `SELECT 'parties      ' || count(*) FROM party
     UNION ALL SELECT 'bills        ' || count(*) FROM bill
     UNION ALL SELECT 'bill lines   ' || count(*) FROM bill_line
     UNION ALL SELECT 'payments     ' || count(*) FROM payment
     UNION ALL SELECT 'expenses     ' || count(*) FROM expense
     UNION ALL SELECT 'employees    ' || count(*) FROM employee
     UNION ALL SELECT 'users        ' || count(*) FROM users
     UNION ALL SELECT 'counter ' || name || ' at ' || value FROM counter ORDER BY 1`,
  ],
);

console.log('\nLocal interim_dev now holds:');
for (const line of counts.out.split('\n')) {
  if (line.trim()) console.log(`  ${line.trim()}`);
}

console.log(
  '\nNext: pnpm db:setup applies db/schema.sql on top, which is the migration' +
    '\nrehearsal. Delete backups/prod-' +
    stamp +
    '.sql when you are done with it.',
);
