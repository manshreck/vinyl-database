import { Pool } from 'pg'

const globalForControlDb = globalThis as unknown as {
  controlPool?: Pool
  controlPoolReady?: Promise<void>
}

const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    database_name  VARCHAR(63) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
  );

  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  );
`

function createPool() {
  return new Pool({ connectionString: process.env.CONTROL_DATABASE_URL! })
}

const controlPool = globalForControlDb.controlPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForControlDb.controlPool = controlPool

const controlPoolReady =
  globalForControlDb.controlPoolReady ?? controlPool.query(BOOTSTRAP_SQL).then(() => undefined)
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

export type ControlSession = {
  userId: number
  email: string
  databaseName: string
  expiresAt: Date
}

export type UserSummary = {
  id: number
  email: string
  databaseName: string
  createdAt: Date
  lastLoginAt: Date | null
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
    [email, passwordHash, databaseName]
  )
  return rows[0]
}

export async function deleteUser(id: number): Promise<void> {
  const pool = await ready()
  await pool.query(`DELETE FROM users WHERE id = $1`, [id])
}

export async function findUserByEmail(email: string): Promise<ControlUser | null> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", database_name AS "databaseName"
     FROM users WHERE email = $1`,
    [email]
  )
  return rows[0] ?? null
}

export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  const pool = await ready()
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt]
  )
}

export async function findSessionByTokenHash(tokenHash: string): Promise<ControlSession | null> {
  const pool = await ready()
  const { rows } = await pool.query(
    `SELECT u.id AS "userId", u.email, u.database_name AS "databaseName", s.expires_at AS "expiresAt"
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  )
  return rows[0] ?? null
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
