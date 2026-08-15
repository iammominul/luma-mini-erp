import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { db } from './db';
import { requireEnv } from './env';

/**
 * The Better Auth instance. This is the same library and the same session model
 * the full ERP runs on, so an account moves across with the book rather than
 * being keyed again.
 *
 * Named users replaced the one shared password on 2026-08-14. Everything below
 * is server side and Node only: it opens a connection pool, so it must never be
 * imported from src/proxy.ts, which runs on the Edge runtime. The proxy does an
 * optimistic cookie check instead and the real check happens here.
 *
 * Column names are mapped by hand rather than generated. db/schema.sql is the
 * whole schema in this repository and stays hand written, so the mapping below
 * is the contract between that file and this library. It matches the ERP's
 * Prisma @map names exactly, which is what lets a user table export across.
 */

let pool: NeonPool | PgPool | null = null;
let instance: ReturnType<typeof build> | null = null;

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
}

/**
 * A pool, not the HTTP driver db() uses. Better Auth needs a pooled connection
 * because it runs multi statement transactions, which Neon's HTTP driver cannot
 * do. Local Postgres gets node-postgres; Neon gets its own WebSocket pool.
 * Node 22 has a global WebSocket, which is why the `ws` package is not needed.
 */
function getPool(): NeonPool | PgPool {
  const url = requireEnv('DATABASE_URL');
  pool ??= isLocal(url)
    ? new PgPool({ connectionString: url, max: 4 })
    : new NeonPool({ connectionString: url });
  return pool;
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'Missing environment variable AUTH_SECRET. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))". See .env.example.',
    );
  }
  return secret;
}

function build() {
  return betterAuth({
    // AUTH_SECRET is what the ERP calls it. SESSION_SECRET is accepted too, so
    // a deployment that predates named users keeps working without an edit.
    // Neither set is a hard stop: with no secret no session can be signed, and
    // starting anyway would hand out cookies nothing could verify.
    secret: authSecret(),
    // Left unset, Better Auth reads the origin off the request, which is what a
    // preview deployment needs. Set AUTH_URL to pin it in production.
    baseURL: process.env.AUTH_URL,
    basePath: '/api/auth',
    database: getPool(),
    // Sign-up stays on at the library level so the seed script and the Owner
    // can create users through the server side API. The public HTTP sign-up
    // route is blocked in src/app/api/auth/[...all]/route.ts, so nobody can
    // self-register: this is an internal book, not a service.
    emailAndPassword: { enabled: true },
    user: {
      modelName: 'users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        // input: false keeps both of these out of anything a browser posts.
        // A role is granted by an Owner through mutations.ts, never claimed.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'viewer',
          input: false,
        },
        status: {
          type: 'string',
          required: false,
          defaultValue: 'active',
          input: false,
        },
      },
    },
    session: {
      modelName: 'sessions',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    // "account" is Better Auth's credential row. The ERP renames it to stay
    // clear of its ledger Account; the name is kept identical here so the two
    // schemas match.
    account: {
      modelName: 'auth_accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        idToken: 'id_token',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    // A disabled account gets no session, so disabling somebody is what locks
    // them out rather than only removing the sessions they already had.
    //
    // Better Auth knows nothing about the status column, so without this the
    // password would still be accepted, a session would be issued, and every
    // page would then turn them away one at a time with nothing said. It is
    // checked here, at the one place a session is created, rather than in the
    // sign-in action: an account is disabled for a reason and there must be no
    // second door.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const sql = db();
            const rows = (await sql`
              SELECT status FROM users WHERE id = ${session.userId}::text
            `) as { status: string }[];
            return rows[0]?.status === 'active' ? undefined : false;
          },
          // A session was created, so somebody just signed in. Recorded here
          // rather than in the sign-in action because this is the one place a
          // session comes from, whatever route made it.
          after: async (session) => {
            const sql = db();
            await sql`
              UPDATE users SET last_signed_in_at = now()
              WHERE id = ${session.userId}::text
            `;
          },
        },
      },
    },
    rateLimit: { enabled: true, window: 60, max: 100 },
    // Writes the Set-Cookie header when a server action signs somebody in.
    plugins: [nextCookies()],
  });
}

export function auth() {
  instance ??= build();
  return instance;
}

export type AuthInstance = ReturnType<typeof build>;
