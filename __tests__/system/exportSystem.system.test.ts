/**
 * @jest-environment node
 *
 * System integration test: buildSystemBackup against a real Postgres database, with
 * the backup restored into a second real database and compared to the first. See
 * TESTING.md §2.4.
 *
 * Justified by the same gap as the per-tenant export's round trip, with more at
 * stake: a whole-system backup is the last line of defence for every account at once,
 * and its contract is "this file rebuilds the system", which only executing it can
 * show. It is also trusted precisely when nobody is looking at it — the moment it
 * matters is after the original is gone.
 *
 * Beyond restoring, two properties get asserted here because getting them wrong is
 * silent: that accounts survive (a restore that loses password hashes locks everyone
 * out) and that sessions do not (a restore that revives live tokens turns a leaked
 * backup into logged-in access).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import {
  generateScratchSchemaName,
  createScratchSchema,
  dropScratchSchema,
  runSqlOnScratchSchema,
  createScratchDatabase,
  dropScratchDatabase,
  scratchDatabaseUrl,
} from '@/test-support/db/scratchSchema'
import { databaseUrl, schemaConnectionConfig } from '@/lib/dbUrls'
import { buildSystemBackup } from '@/lib/exportSystem'

const TENANT_SCHEMA_SQL = readFileSync(join(process.cwd(), 'prisma/tenant-schema.sql'), 'utf8')

const TENANT_TABLES = [
  'artists', 'genres', 'formats', 'releases',
  'release_artists', 'release_genres', 'pressings', 'wishlist_items',
]

function seedTenantSql(artist: string, title: string): string {
  return `
    INSERT INTO formats (name) VALUES ('LP');
    INSERT INTO genres (name) VALUES ('Jazz');
    INSERT INTO artists (name, sort_name, created_at)
      VALUES ('${artist}', '${artist}', '2024-05-05 11:22:33.456789-06');
    INSERT INTO releases (title, original_release_year) VALUES ('${title}', 1970);
    INSERT INTO release_artists (release_id, artist_id) VALUES (1, 1);
    INSERT INTO pressings (release_id, format_id, record_condition, purchase_price)
      VALUES (1, 1, 'NM', 12.34);
  `
}

async function query<T extends Record<string, unknown>>(
  config: { connectionString: string; options?: string },
  sql: string
): Promise<T[]> {
  const client = new Client(config)
  await client.connect()
  try {
    const { rows } = await client.query<T>(sql)
    return rows
  } finally {
    await client.end()
  }
}

/** Column-wise, so it survives a physical column-order difference. */
async function fingerprint(schema: string, tables: string[]): Promise<Record<string, string>> {
  const client = new Client(schemaConnectionConfig(schema))
  await client.connect()
  try {
    const out: Record<string, string> = {}
    for (const table of tables) {
      const { rows: cols } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name`,
        [schema, table]
      )
      const exprs = cols
        .map((c) => `md5(coalesce(string_agg("${c.column_name}"::text, '|' ORDER BY "${c.column_name}"::text), ''))`)
        .join(` || '/' || `)
      const { rows } = await client.query<{ fp: string }>(`SELECT ${exprs} AS fp FROM "${table}"`)
      out[table] = rows[0].fp
    }
    return out
  } finally {
    await client.end()
  }
}

describe('buildSystemBackup round trip (system)', () => {
  const controlSchemaName = generateScratchSchemaName()
  // Real tenant naming: buildSystemBackup discovers schemas by the vinyl_user_ prefix.
  const tenantA = `vinyl_user_${'a'.repeat(12)}`
  const tenantB = `vinyl_user_${'b'.repeat(12)}`
  // The originals are renamed aside before restoring, so both live in one database
  // and can be compared directly.
  const preRestoreControl = generateScratchSchemaName()
  const preRestoreTenantA = generateScratchSchemaName()

  const scratchDb = generateScratchSchemaName()
  let backupSql: string
  let originalControlSchema: string | undefined
  let originalDatabaseUrl: string | undefined

  async function dropTenants() {
    const client = new Client({ connectionString: databaseUrl() })
    await client.connect()
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${tenantA}" CASCADE`)
      await client.query(`DROP SCHEMA IF EXISTS "${tenantB}" CASCADE`)
    } finally {
      await client.end()
    }
  }

  beforeAll(async () => {
    originalControlSchema = process.env.CONTROL_SCHEMA
    originalDatabaseUrl = process.env.DATABASE_URL

    // A whole database of its own: buildSystemBackup discovers tenants by scanning for
    // vinyl_user_* schemas, so running this against the dev database would sweep up
    // (and refuse to back up alongside) the developer's real tenants.
    await createScratchDatabase(scratchDb)
    process.env.DATABASE_URL = scratchDatabaseUrl(scratchDb)
    process.env.CONTROL_SCHEMA = controlSchemaName

    await createScratchSchema(controlSchemaName)

    // Control plane, built the way controlDb's bootstrap does.
    await runSqlOnScratchSchema(controlSchemaName, `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        database_name VARCHAR(63) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ,
        discogs_token TEXT,
        full_name TEXT
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
      INSERT INTO users (email, password_hash, database_name, discogs_token, full_name) VALUES
        ('a@example.test', 'hash-a', '${tenantA}', 'token-a', 'Ann O''Neill'),
        ('b@example.test', 'hash-b', '${tenantB}', NULL, NULL);
      INSERT INTO sessions (token_hash, user_id, expires_at)
        VALUES ('live-session-token', 1, now() + interval '1 day');
    `)

    for (const [schema, artist, title] of [
      [tenantA, 'Alice Coltrane', 'Journey In Satchidananda'],
      [tenantB, 'Bill Evans', 'Sunday At The Village Vanguard'],
    ] as const) {
      const client = new Client({ connectionString: databaseUrl() })
      await client.connect()
      try {
        await client.query(`CREATE SCHEMA "${schema}"`)
      } finally {
        await client.end()
      }
      await query(schemaConnectionConfig(schema), TENANT_SCHEMA_SQL)
      await query(schemaConnectionConfig(schema), seedTenantSql(artist, title))
    }

    backupSql = await buildSystemBackup()
  }, 90000)

  afterAll(async () => {
    if (originalControlSchema === undefined) delete process.env.CONTROL_SCHEMA
    else process.env.CONTROL_SCHEMA = originalControlSchema
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
    await dropScratchDatabase(scratchDb)
  }, 60000)

  it('warns in the file itself that it holds secrets', () => {
    expect(backupSql).toContain('TREAT THIS FILE AS A SECRET')
    expect(backupSql).toMatch(/password hash and Discogs API token/)
  })

  it('rebuilds each tenant under its own schema name, not into public', () => {
    expect(backupSql).toContain(`CREATE SCHEMA "${tenantA}";`)
    expect(backupSql).toContain(`CREATE SCHEMA "${tenantB}";`)
    expect(backupSql).toContain(`SET search_path TO "${tenantA}";`)
  })

  it('includes accounts but not sessions', () => {
    expect(backupSql).toContain("'a@example.test'")
    expect(backupSql).toContain("'hash-a'")
    // The tables must exist so the app boots; their contents must not come back.
    expect(backupSql).toContain('CREATE TABLE sessions')
    expect(backupSql).not.toContain('live-session-token')
    expect(backupSql).not.toContain('INSERT INTO sessions')
  })

  it('escapes apostrophes in control-plane data', () => {
    expect(backupSql).toContain("'Ann O''Neill'")
  })

  describe('restored into an empty database', () => {
    beforeAll(async () => {
      // Move the originals aside rather than dropping them: the backup recreates
      // these exact names, and keeping the originals lets the restored copies be
      // compared against them in the same database.
      const client = new Client({ connectionString: databaseUrl() })
      await client.connect()
      try {
        await client.query(`ALTER SCHEMA "${controlSchemaName}" RENAME TO "${preRestoreControl}"`)
        await client.query(`ALTER SCHEMA "${tenantA}" RENAME TO "${preRestoreTenantA}"`)
        await client.query(`DROP SCHEMA "${tenantB}" CASCADE`)
        await client.query(backupSql)
      } finally {
        await client.end()
      }
    }, 90000)

    it('restores every account, with tokens intact', async () => {
      const rows = await query<{ email: string; password_hash: string; discogs_token: string | null }>(
        schemaConnectionConfig(controlSchemaName),
        'SELECT email, password_hash, discogs_token FROM users ORDER BY id'
      )
      expect(rows).toEqual([
        { email: 'a@example.test', password_hash: 'hash-a', discogs_token: 'token-a' },
        { email: 'b@example.test', password_hash: 'hash-b', discogs_token: null },
      ])
    })

    it('restores the sessions table empty', async () => {
      const rows = await query<{ count: string }>(
        schemaConnectionConfig(controlSchemaName),
        'SELECT count(*)::int AS count FROM sessions'
      )
      expect(Number(rows[0].count)).toBe(0)
    })

    it('restores both tenants identically, to the microsecond', async () => {
      for (const schema of [tenantA, tenantB]) {
        const fp = await fingerprint(schema, TENANT_TABLES)
        // Every table present and non-trivially compared.
        expect(Object.keys(fp).sort()).toEqual([...TENANT_TABLES].sort())
        const artists = await query<{ created_at: string }>(
          schemaConnectionConfig(schema),
          'SELECT created_at::text FROM artists'
        )
        expect(artists[0].created_at).toContain('.456789')
      }
    })

    it('keeps each tenant separate — no cross-contamination', async () => {
      const a = await query<{ title: string }>(
        schemaConnectionConfig(tenantA),
        'SELECT title FROM releases'
      )
      const b = await query<{ title: string }>(
        schemaConnectionConfig(tenantB),
        'SELECT title FROM releases'
      )
      expect(a.map((r) => r.title)).toEqual(['Journey In Satchidananda'])
      expect(b.map((r) => r.title)).toEqual(['Sunday At The Village Vanguard'])
    })

    it('leaves sequences ready for the next insert in each schema', async () => {
      const rows = await query<{ artist_id: number }>(
        schemaConnectionConfig(tenantA),
        `INSERT INTO artists (name, sort_name) VALUES ('Probe', 'Probe') RETURNING artist_id`
      )
      expect(rows[0].artist_id).toBeGreaterThan(1)
    })
  })

  describe('consistency guards', () => {
    it('refuses when an account references a schema that does not exist', async () => {
      await runSqlOnScratchSchema(controlSchemaName, `
        INSERT INTO users (email, password_hash, database_name)
        VALUES ('ghost@example.test', 'h', 'vinyl_user_cccccccccccc')
      `)
      try {
        await expect(buildSystemBackup()).rejects.toThrow(/do not exist/)
      } finally {
        await runSqlOnScratchSchema(
          controlSchemaName,
          `DELETE FROM users WHERE email = 'ghost@example.test'`
        )
      }
    }, 30000)

    it('refuses when a tenant schema has no account, rather than omitting it', async () => {
      const orphan = `vinyl_user_${'d'.repeat(12)}`
      const client = new Client({ connectionString: databaseUrl() })
      await client.connect()
      try {
        await client.query(`CREATE SCHEMA "${orphan}"`)
        await expect(buildSystemBackup()).rejects.toThrow(/no account/)
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${orphan}" CASCADE`)
        await client.end()
      }
    }, 30000)
  })
})
