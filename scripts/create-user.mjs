#!/usr/bin/env node
/**
 * Create a user account, or reset the password of one that exists.
 *
 * This is how the first Owner gets in. After that an Owner adds people on the
 * Users screen, and this script is only needed again if everybody is locked out
 * and somebody has to reset a password from the server.
 *
 *   node scripts/create-user.mjs --email a@b.com --name "Full Name" \
 *     --password "..." --role owner
 *
 * The password is hashed with Better Auth's own hasher, and the two rows
 * written are exactly the ones its sign-up writes: the account in `users` and
 * the credential in `auth_accounts`. Nothing here duplicates the auth config in
 * src/lib/auth.ts, so the two cannot drift.
 *
 * Pass --password to set one, or leave it out and one is generated and printed.
 * DATABASE_URL is read from the environment, or from .env.local if it is not
 * set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';

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

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set. See .env.example.');

const email = (arg('email') ?? '').trim().toLowerCase();
const name = (arg('name') ?? '').trim();
const role = (arg('role') ?? 'owner').trim();
const password = arg('password') ?? randomBytes(12).toString('base64url');
const generated = !arg('password');

if (!email) fail('Pass --email.');
if (!name) fail('Pass --name.');
if (!['owner', 'accounts', 'viewer'].includes(role)) {
  fail("--role must be one of: owner, accounts, viewer.");
}
if (password.length < 8) fail('A password must be at least 8 characters.');

const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
const { Pool } = isLocal
  ? await import('pg')
  : await import('@neondatabase/serverless');
const pool = new Pool({ connectionString: url });

const hash = await hashPassword(password);
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const existing = await client.query(
    'SELECT id, role FROM users WHERE lower(email) = $1',
    [email],
  );

  let id;
  let action;
  if (existing.rows.length > 0) {
    id = existing.rows[0].id;
    action = 'Reset the password for';
    await client.query(
      'UPDATE users SET name = $2, role = $3, status = $4, updated_at = now() WHERE id = $1',
      [id, name, role, 'active'],
    );
    // A user may have no credential row if one was removed by hand. Upsert
    // rather than update, so this script always leaves an account that works.
    const updated = await client.query(
      `UPDATE auth_accounts SET password = $2, updated_at = now()
       WHERE user_id = $1 AND provider_id = 'credential' RETURNING id`,
      [id, hash],
    );
    if (updated.rows.length === 0) {
      await client.query(
        `INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password)
         VALUES ($1, $2, $2, 'credential', $3)`,
        [randomUUID(), id, hash],
      );
    }
  } else {
    id = randomUUID();
    action = 'Created';
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, role, status)
       VALUES ($1, $2, $3, true, $4, 'active')`,
      [id, name, email, role],
    );
    await client.query(
      `INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password)
       VALUES ($1, $2, $2, 'credential', $3)`,
      [randomUUID(), id, hash],
    );
  }

  await client.query('COMMIT');
  console.log(`${action} ${role} account ${email} (${name}).`);
  if (generated) console.log(`Password: ${password}`);
} catch (error) {
  await client.query('ROLLBACK');
  fail(`Could not write the account: ${error.message}`);
} finally {
  client.release();
  await pool.end();
}
