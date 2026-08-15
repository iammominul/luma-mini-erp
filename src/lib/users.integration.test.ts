import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * User accounts against a real Postgres: creating them, changing a role,
 * disabling one, resetting a password, and the guard that stops the last active
 * Owner being taken away.
 *
 * The password is checked with Better Auth's own verifier, because the point of
 * writing the credential row by hand in mutations.ts is that the library can
 * still read it. If that stops being true, nobody can sign in, and this is
 * where it shows up rather than on the login screen.
 *
 * Same harness as the other integration tests: a throwaway schema, dropped
 * afterwards. Skipped unless INTERIM_TEST_DATABASE_URL names a database.
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const SCHEMA = 'interim_users_test';

/** Who the tests write as. Every mutation records an actor. */
const TEST_ACTOR = { id: 'test-owner', name: 'Test Owner' };

let driver: PgDriver;

vi.mock('./db', () => ({ db: () => driver }));

const user = (over: Record<string, string> = {}) => ({
  name: 'Rafiqul Islam',
  email: 'rafiqul@example.com',
  password: 'a-long-enough-password',
  role: 'accounts' as const,
  ...over,
});

describe.skipIf(!CONNECTION)('user accounts', () => {
  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    driver = createPgDriver(CONNECTION!, SCHEMA);
    const schemaSql = readFileSync(
      join(import.meta.dirname, '..', '..', 'db', 'schema.sql'),
      'utf8',
    );
    for (const statement of splitSqlStatements(schemaSql)) {
      await driver.query(statement);
    }
  }, 60_000);

  afterAll(async () => {
    if (!CONNECTION) return;
    await driver.end();
    const admin = createPgDriver(CONNECTION, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('creates an account Better Auth can sign in, and logs who added it', async () => {
    const { createUser } = await import('./mutations');
    const { getUser, recentActivity } = await import('./queries');
    const { verifyPassword } = await import('better-auth/crypto');

    const id = await createUser(user(), TEST_ACTOR);
    const created = (await getUser(id))!;
    expect(created.email).toBe('rafiqul@example.com');
    expect(created.role).toBe('accounts');
    expect(created.status).toBe('active');
    expect(created.hasLiveSession).toBe(false);

    // The credential row has to be one the library accepts.
    const rows = (await driver.query(
      `SELECT password, provider_id, account_id FROM auth_accounts WHERE user_id = $1`,
      [id],
    )) as { password: string; provider_id: string; account_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider_id).toBe('credential');
    expect(rows[0]!.account_id).toBe(id);
    expect(
      await verifyPassword({
        hash: rows[0]!.password,
        password: 'a-long-enough-password',
      }),
    ).toBe(true);
    // And it is a hash, not the password.
    expect(rows[0]!.password).not.toContain('a-long-enough-password');

    const [entry] = await recentActivity(1);
    expect(entry!.entity).toBe('user');
    expect(entry!.actorName).toBe('Test Owner');
    expect(entry!.summary).toContain('Rafiqul Islam');
  }, 30_000);

  it('refuses a second account on the same email, whatever the case', async () => {
    const { InputError, createUser } = await import('./mutations');
    await expect(
      createUser(user({ email: 'RAFIQUL@example.com' }), TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
  }, 30_000);

  it('never lets the last active Owner be demoted or disabled', async () => {
    const { InputError, createUser, setUserRole, setUserStatus } =
      await import('./mutations');
    const { getUser, otherActiveOwners } = await import('./queries');

    const ownerId = await createUser(
      user({ name: 'First Owner', email: 'owner1@example.com', role: 'owner' }),
      TEST_ACTOR,
    );
    expect(await otherActiveOwners(ownerId)).toBe(0);

    // The only way out of user management, so both are refused.
    await expect(
      setUserRole(ownerId, 'accounts', TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
    await expect(
      setUserStatus(ownerId, 'disabled', TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
    expect((await getUser(ownerId))!.role).toBe('owner');

    // With a second Owner in place the first one can step down.
    const secondId = await createUser(
      user({ name: 'Second Owner', email: 'owner2@example.com', role: 'owner' }),
      TEST_ACTOR,
    );
    expect(await otherActiveOwners(ownerId)).toBe(1);
    await setUserRole(ownerId, 'accounts', TEST_ACTOR);
    expect((await getUser(ownerId))!.role).toBe('accounts');

    // And now the second one is the last, so it is held in place in turn.
    await expect(
      setUserStatus(secondId, 'disabled', TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
  }, 30_000);

  it('drops every session when an account is disabled', async () => {
    const { createUser, setUserStatus } = await import('./mutations');
    const { getUser } = await import('./queries');

    const id = await createUser(
      user({ name: 'Nurul Amin', email: 'nurul@example.com' }),
      TEST_ACTOR,
    );
    await driver.query(
      `INSERT INTO sessions (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      ['session-1', id, 'token-1'],
    );
    expect((await getUser(id))!.hasLiveSession).toBe(true);

    await setUserStatus(id, 'disabled', TEST_ACTOR);
    const disabled = (await getUser(id))!;
    expect(disabled.status).toBe('disabled');
    // Out at once, rather than at the end of the week the cookie would run for.
    expect(disabled.hasLiveSession).toBe(false);

    // Enabling again does not hand the old session back.
    await setUserStatus(id, 'active', TEST_ACTOR);
    expect((await getUser(id))!.hasLiveSession).toBe(false);
  }, 30_000);

  it('refuses to disable the account doing the disabling', async () => {
    const { InputError, createUser, setUserStatus } = await import('./mutations');
    const id = await createUser(
      user({ name: 'Self Disabler', email: 'self@example.com' }),
      TEST_ACTOR,
    );
    await expect(
      setUserStatus(id, 'disabled', { id, name: 'Self Disabler' }),
    ).rejects.toBeInstanceOf(InputError);
  }, 30_000);

  /**
   * recentActivity used to order by its own output aliases rather than by the
   * table's columns, so it sorted the formatted date string and the text cast
   * of the id. Two entries in the same minute came back in the wrong order and
   * a list crossing a month was reliably wrong. The feed is the record of who
   * changed what, so the order it reads in is part of what it says.
   */
  it('returns the newest activity first, within the same minute', async () => {
    const { createUser, setUserRole } = await import('./mutations');
    const { recentActivity } = await import('./queries');

    const id = await createUser(
      user({ name: 'Order Check', email: 'order@example.com' }),
      TEST_ACTOR,
    );
    await setUserRole(id, 'viewer', TEST_ACTOR);
    await setUserRole(id, 'owner', TEST_ACTOR);

    const [newest, second, third] = await recentActivity(3);
    expect(newest!.summary).toContain('to Owner');
    expect(second!.summary).toContain('to Viewer');
    expect(third!.summary).toContain('Added');
  }, 30_000);

  it('changes a name and an email, and leaves the password and sessions alone', async () => {
    const { createUser, updateUserProfile } = await import('./mutations');
    const { getUser, recentActivity } = await import('./queries');
    const { verifyPassword } = await import('better-auth/crypto');

    const id = await createUser(
      user({ name: 'Old Name', email: 'old@example.com' }),
      TEST_ACTOR,
    );
    await driver.query(
      `INSERT INTO sessions (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      ['session-profile', id, 'token-profile'],
    );

    await updateUserProfile(
      id,
      { name: 'New Name', email: 'new@example.com' },
      TEST_ACTOR,
    );

    const after = (await getUser(id))!;
    expect(after.name).toBe('New Name');
    expect(after.email).toBe('new@example.com');

    // The credential is keyed to the user id, not the address, so the password
    // still opens the account and nobody is signed out by a change of email.
    const rows = (await driver.query(
      `SELECT password FROM auth_accounts WHERE user_id = $1`,
      [id],
    )) as { password: string }[];
    expect(
      await verifyPassword({
        hash: rows[0]!.password,
        password: 'a-long-enough-password',
      }),
    ).toBe(true);
    expect(after.hasLiveSession).toBe(true);

    const [entry] = await recentActivity(1);
    expect(entry!.summary).toContain('old@example.com');
    expect(entry!.summary).toContain('new@example.com');
  }, 30_000);

  it('refuses an email another account already holds, whatever the case', async () => {
    const { InputError, createUser, updateUserProfile } = await import('./mutations');
    const { getUser } = await import('./queries');

    const first = await createUser(
      user({ name: 'Holder', email: 'taken@example.com' }),
      TEST_ACTOR,
    );
    const second = await createUser(
      user({ name: 'Other', email: 'other@example.com' }),
      TEST_ACTOR,
    );

    await expect(
      updateUserProfile(
        second,
        { name: 'Other', email: 'TAKEN@example.com' },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);
    expect((await getUser(second))!.email).toBe('other@example.com');

    // Keeping its own address is not a clash with itself.
    await updateUserProfile(
      first,
      { name: 'Holder Renamed', email: 'taken@example.com' },
      TEST_ACTOR,
    );
    expect((await getUser(first))!.name).toBe('Holder Renamed');
  }, 30_000);

  it('changes an own password only with the current one, keeping this session', async () => {
    const { InputError, changeOwnPassword, createUser } = await import('./mutations');
    const { getUser, recentActivity } = await import('./queries');
    const { verifyPassword } = await import('better-auth/crypto');

    const id = await createUser(
      user({ name: 'Self Server', email: 'self-serve@example.com' }),
      TEST_ACTOR,
    );
    for (const [sid, token] of [
      ['this-device', 'token-this'],
      ['other-device', 'token-other'],
    ]) {
      await driver.query(
        `INSERT INTO sessions (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, now() + interval '7 days')`,
        [sid, id, token],
      );
    }

    // The wrong current password changes nothing.
    await expect(
      changeOwnPassword(
        id,
        { currentPassword: 'not-the-password', newPassword: 'a-brand-new-one' },
        'this-device',
      ),
    ).rejects.toBeInstanceOf(InputError);

    // And neither does reusing the one already set.
    await expect(
      changeOwnPassword(
        id,
        {
          currentPassword: 'a-long-enough-password',
          newPassword: 'a-long-enough-password',
        },
        'this-device',
      ),
    ).rejects.toBeInstanceOf(InputError);

    await changeOwnPassword(
      id,
      {
        currentPassword: 'a-long-enough-password',
        newPassword: 'a-brand-new-password',
      },
      'this-device',
    );

    const rows = (await driver.query(
      `SELECT password FROM auth_accounts WHERE user_id = $1`,
      [id],
    )) as { password: string }[];
    expect(
      await verifyPassword({
        hash: rows[0]!.password,
        password: 'a-brand-new-password',
      }),
    ).toBe(true);

    // The device doing the changing stays signed in; every other one is out.
    const sessions = (await driver.query(
      `SELECT id FROM sessions WHERE user_id = $1`,
      [id],
    )) as { id: string }[];
    expect(sessions.map((s) => s.id)).toEqual(['this-device']);
    expect((await getUser(id))!.hasLiveSession).toBe(true);

    const [entry] = await recentActivity(1);
    expect(entry!.actorName).toBe('Self Server');
    expect(JSON.stringify(entry)).not.toContain('a-brand-new-password');
  }, 30_000);

  it('signs out other devices and keeps this one', async () => {
    const { createUser, signOutOtherSessions } = await import('./mutations');

    const id = await createUser(
      user({ name: 'Many Devices', email: 'devices@example.com' }),
      TEST_ACTOR,
    );
    for (const [sid, token] of [
      ['keep-me', 'token-keep'],
      ['drop-1', 'token-drop-1'],
      ['drop-2', 'token-drop-2'],
    ]) {
      await driver.query(
        `INSERT INTO sessions (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, now() + interval '7 days')`,
        [sid, id, token],
      );
    }

    const dropped = await signOutOtherSessions(id, 'keep-me', {
      id,
      name: 'Many Devices',
    });
    expect(dropped).toBe(2);

    const sessions = (await driver.query(
      `SELECT id FROM sessions WHERE user_id = $1`,
      [id],
    )) as { id: string }[];
    expect(sessions.map((s) => s.id)).toEqual(['keep-me']);

    // Running it again is not an error, it just finds nothing to do.
    expect(await signOutOtherSessions(id, 'keep-me', { id, name: 'x' })).toBe(0);
  }, 30_000);

  it('resets a password, clears the sessions, and logs no password', async () => {
    const { createUser, resetUserPassword } = await import('./mutations');
    const { getUser, recentActivity } = await import('./queries');
    const { verifyPassword } = await import('better-auth/crypto');

    const id = await createUser(
      user({ name: 'Shahin Alam', email: 'shahin@example.com' }),
      TEST_ACTOR,
    );
    await driver.query(
      `INSERT INTO sessions (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      ['session-2', id, 'token-2'],
    );

    await resetUserPassword(id, 'another-long-password', TEST_ACTOR);

    const rows = (await driver.query(
      `SELECT password FROM auth_accounts WHERE user_id = $1`,
      [id],
    )) as { password: string }[];
    expect(
      await verifyPassword({
        hash: rows[0]!.password,
        password: 'another-long-password',
      }),
    ).toBe(true);
    // The old one stops working.
    expect(
      await verifyPassword({
        hash: rows[0]!.password,
        password: 'a-long-enough-password',
      }),
    ).toBe(false);
    expect((await getUser(id))!.hasLiveSession).toBe(false);

    const [entry] = await recentActivity(1);
    expect(entry!.summary).toContain('Shahin Alam');
    // A log that carried the password would be a place to read it from.
    expect(JSON.stringify(entry)).not.toContain('another-long-password');
  }, 30_000);
});
