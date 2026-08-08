import { Pool } from 'pg'
import { assertSafeSchemaName, controlConnectionConfig, controlSchema } from '@/lib/dbUrls'

const globalForControlDb = globalThis as unknown as {
  controlPool?: Pool
  controlPoolReady?: Promise<void>
}

/**
 * One round trip, deliberately: the schema is created and selected in the same batch
 * as the tables that go in it.
 *
 * Splitting this across two `pool.query` calls leaves a window in which the pool can
 * be closed between them — which the seam tests, reloading this module against
 * successive scratch schemas, hit immediately ("Cannot use a pool after calling end").
 * The explicit `SET search_path` also removes any question of whether the pool's
 * connection-level setting resolves before the schema exists.
 *
 * The tables are unqualified so they land wherever that search_path points, which is
 * what lets a test redirect the whole module with CONTROL_SCHEMA.
 *
 * `database_name` keeps its column name while now holding a *schema* name. The
 * values are unchanged by the migration (tenant schemas reuse the old database
 * names), so renaming the column would ripple through controlDb, session, every
 * action and every test for no behavioral difference.
 */
function bootstrapSql(): string {
  const schema = controlSchema()
  assertSafeSchemaName(schema)
  return `
  CREATE SCHEMA IF NOT EXISTS "${schema}";
  SET search_path TO "${schema}";

  -- Take both table locks up front, in this exact order, before any DDL below.
  --
  -- Everything in this batch runs as one implicit transaction, so every lock it
  -- takes is held until the end. The DDL below reaches 'users' first and 'sessions'
  -- second, while the hot path -- findSessionByTokenHash's "FROM sessions JOIN
  -- users" -- locks them the other way around. That inversion is a deadlock: a
  -- request holding AccessShare on sessions waits for users while this batch holds
  -- AccessExclusive on users and waits for sessions. Postgres detects the cycle and
  -- kills the request, which surfaces to the user as a deadlock error on an ordinary
  -- page load. It happened once in production on 2026-08-07.
  --
  -- (Deliberately not spelling out Postgres's exact error phrase here: this batch is
  -- echoed into the server log whenever a statement in it fails, and a comment
  -- containing that phrase makes the log unsearchable for the real thing.)
  --
  -- Acquiring both here, sessions first, matches the query's order and removes the
  -- cycle: a concurrent reader either finishes before this batch starts, or blocks
  -- on sessions while holding nothing at all.
  --
  -- Conditional because on a brand-new schema the tables don't exist yet -- and
  -- can't be contended either, since nothing can be reading a table that isn't
  -- there. LOCK is legal here only because the batch is an implicit transaction.
  DO $$
  BEGIN
    IF to_regclass('sessions') IS NOT NULL AND to_regclass('users') IS NOT NULL THEN
      LOCK TABLE sessions, users IN ACCESS EXCLUSIVE MODE;
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    database_name  VARCHAR(63) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
  );

  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS discogs_token TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    origin     TEXT NOT NULL DEFAULT 'web'
  );

  -- Which transport issued the session: it decides the lifetime policy (fixed on the
  -- web, sliding on mobile) and is what a future "sign out my phone" would key on.
  -- The 'web' default is exactly right for the backfill: every row predating this
  -- column was issued by a browser, because no other client existed yet.
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'web';

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  );
`
}

function createPool() {
  return new Pool(controlConnectionConfig())
}

const controlPool = globalForControlDb.controlPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForControlDb.controlPool = controlPool

const controlPoolReady =
  globalForControlDb.controlPoolReady ?? controlPool.query(bootstrapSql()).then(() => undefined)
if (process.env.NODE_ENV !== 'production') globalForControlDb.controlPoolReady = controlPoolReady

async function ready() {
  await controlPoolReady
  return controlPool
}

export type ControlUser = {
  id: number
  email: string
  passwordHash: string
  databaseName: string
}

/** Where a session was established. Stored as text; validated on the way in. */
export type SessionOrigin = 'web' | 'mobile'

export type ControlSession = {
  userId: number
  email: string
  databaseName: string
  discogsToken: string | null
  fullName: string | null
  expiresAt: Date
  origin: SessionOrigin
}

export type UserSummary = {
  id: number
  email: string
  databaseName: string
  createdAt: Date
  lastLoginAt: Date | null
}

/**
 * The one place an email is canonicalized. `users.email` is a plain UNIQUE column,
 * which would otherwise hold `A@b.com` and `a@b.com` as two separate accounts.
 *
 * It lives here, next to the queries, rather than in the callers: every read and
 * write of an email goes through this module, so normalizing at this boundary makes
 * "the same address always finds the same row" true by construction. Callers used to
 * do it themselves, and two of the four had quietly stopped — correct only because
 * their value happened to arrive already-canonical from the session. See
 * DEVELOPER_GUIDE §7, "Display strings are identity".
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function createUser(
  email: string,
  passwordHash: string,
  databaseName: string
): Promise<ControlUser> {
  const pool = await ready()
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, database_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, password_hash AS "passwordHash", database_name AS "databaseName"`,
    [normalizeEmail(email), passwordHash, databaseName]
  )
  return rows[0]
}

export async function deleteUser(id: number): Promise<void> {
  const pool = await ready()
  await pool.query(`DELETE FROM users WHERE id = $1`, [id])
}

export async function updatePasswordHash(id: number, passwordHash: string): Promise<void> {
  const pool = await ready()
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id])
}

export async function updateDiscogsToken(id: number, discogsToken: string | null): Promise<void> {
  const pool = await ready()
  await pool.query(`UPDATE users SET discogs_token = $1 WHERE id = $2`, [discogsToken, id])
}

export async function updateFullName(id: number, fullName: string | null): Promise<void> {
  const pool = await ready()
  await pool.query(`UPDATE users SET full_name = $1 WHERE id = $2`, [fullName, id])
}

export async function findUserByEmail(email: string): Promise<ControlUser | null> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", database_name AS "databaseName"
     FROM users WHERE email = $1`,
    [normalizeEmail(email)]
  )
  return rows[0] ?? null
}

export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  origin: SessionOrigin = 'web'
): Promise<void> {
  const pool = await ready()
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, origin) VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, expiresAt, origin]
  )
}

export async function findSessionByTokenHash(tokenHash: string): Promise<ControlSession | null> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT u.id AS "userId", u.email, u.database_name AS "databaseName", u.discogs_token AS "discogsToken", u.full_name AS "fullName", s.expires_at AS "expiresAt", s.origin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  )
  return rows[0] ?? null
}

/**
 * Pushes a session's expiry back — the write behind sliding renewal.
 *
 * Guarded by `expires_at > now()` so this can only ever extend a session that is
 * still valid: an expired token cannot be revived by presenting it, and a session
 * deleted by a concurrent logout is not resurrected.
 */
export async function touchSession(tokenHash: string, expiresAt: Date): Promise<void> {
  const pool = await ready()
  await pool.query(
    `UPDATE sessions SET expires_at = $2 WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash, expiresAt]
  )
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  const pool = await ready()
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
}

export async function updateLastLogin(userId: number): Promise<void> {
  const pool = await ready()
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId])
}

export async function listUsers(): Promise<UserSummary[]> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT id, email, database_name AS "databaseName", created_at AS "createdAt", last_login_at AS "lastLoginAt"
     FROM users ORDER BY created_at ASC`
  )
  return rows
}

export async function createAdminSession(tokenHash: string, expiresAt: Date): Promise<void> {
  const pool = await ready()
  await pool.query(
    `INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, $2)`,
    [tokenHash, expiresAt]
  )
}

export async function findAdminSession(tokenHash: string): Promise<{ expiresAt: Date } | null> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT expires_at AS "expiresAt" FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  )
  return rows[0] ?? null
}

export async function deleteAdminSessionByTokenHash(tokenHash: string): Promise<void> {
  const pool = await ready()
  await pool.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash])
}
