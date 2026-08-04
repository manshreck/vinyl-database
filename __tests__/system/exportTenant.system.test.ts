/**
 * @jest-environment node
 *
 * System integration test: buildTenantSqlExport against a real Postgres database,
 * with the export then restored into a second real database and compared to the
 * first. See TESTING.md §2.4.
 *
 * Justified by a gap no smaller test can cover: the contract of an export is not
 * "produces plausible SQL", it is "the file rebuilds the data". That is only
 * demonstrable by executing the output against a real Postgres — the round trip is
 * the assertion. A fake or a string-shape check would happily pass on output that
 * fails to restore, which is the failure mode that matters, since an export is
 * trusted precisely when nobody is looking at it.
 *
 * This caught real precision loss during development: timestamps routed through a JS
 * Date lost microseconds, so restored rows silently differed from the originals.
 */
import {
  generateScratchDatabaseName,
  createScratchDatabase,
  dropScratchDatabase,
  applyTenantSchema,
  runSqlOnScratchDatabase,
} from '@/test-support/db/scratchDatabase'
import { tenantConnectionString } from '@/lib/dbUrls'
import { buildTenantSqlExport } from '@/lib/exportTenant'
import { Client } from 'pg'

/** Microsecond precision and an apostrophe: the two things naive serialization loses. */
const SEED_SQL = `
INSERT INTO artists (name, sort_name, created_at) VALUES
  ('Guns N'' Roses', 'Guns N'' Roses', '2024-03-01 12:34:56.123456-07'),
  ('Miles Davis', 'Davis, Miles', '2024-03-02 01:02:03.000001-07');
INSERT INTO releases (title, original_release_year, notes, cover_image_url) VALUES
  ('Kind Of Blue', 1959, 'A note with '' an apostrophe', 'https://example.test/a.jpg'),
  ('Appetite', 1987, NULL, NULL);
INSERT INTO release_artists (release_id, artist_id, artist_order, role) VALUES
  (1, 2, 1, 'Primary Artist'),
  (2, 1, 1, 'Primary Artist');
INSERT INTO release_genres (release_id, genre_id, genre_order)
  SELECT 1, genre_id, 1 FROM genres WHERE name = 'Jazz';
INSERT INTO pressings
  (release_id, format_id, pressing_year, country, label, catalog_number, vinyl_color,
   disc_count, record_condition, sleeve_condition, notes, purchase_price, purchase_date, current_value)
  SELECT 1, format_id, 1959, 'US', 'Columbia', 'CL 1355', NULL, 1, 'NM', 'VG+',
         NULL, 42.50, '2024-01-15', 199.99
  FROM formats WHERE name = 'LP';
INSERT INTO wishlist_items (release_id, format_id, pressing_year, country, disc_count)
  SELECT 2, format_id, 1987, 'UK', 2 FROM formats WHERE name = 'LP';
`

const TABLES = [
  'artists', 'genres', 'formats', 'releases',
  'release_artists', 'release_genres', 'pressings', 'wishlist_items',
]

/** Column-wise so the comparison survives a physical column-order difference. */
async function contentFingerprint(databaseName: string): Promise<Record<string, string>> {
  const client = new Client({ connectionString: tenantConnectionString(databaseName) })
  await client.connect()
  try {
    const out: Record<string, string> = {}
    for (const table of TABLES) {
      const { rows: cols } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1 ORDER BY column_name`,
        [table]
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

describe('buildTenantSqlExport round trip (system)', () => {
  const source = generateScratchDatabaseName()
  const restored = generateScratchDatabaseName()
  let exportSql: string

  beforeAll(async () => {
    await createScratchDatabase(source)
    await applyTenantSchema(source)
    await runSqlOnScratchDatabase(source, SEED_SQL)
    exportSql = await buildTenantSqlExport(source)

    await createScratchDatabase(restored)
    await runSqlOnScratchDatabase(restored, exportSql)
  }, 60000)

  afterAll(async () => {
    await dropScratchDatabase(source)
    await dropScratchDatabase(restored)
  }, 30000)

  it('produces a file that restores into an empty database without error', () => {
    // Reaching afterAll's setup at all means the restore executed; assert it carried
    // the schema too, so the file genuinely stands alone.
    expect(exportSql).toContain('CREATE TABLE "pressings"')
    expect(exportSql).toContain('CREATE TYPE "condition_grade"')
  })

  it('restores every row of every table identically', async () => {
    const [before, after] = await Promise.all([
      contentFingerprint(source),
      contentFingerprint(restored),
    ])
    expect(after).toEqual(before)
  })

  it('preserves microsecond timestamp precision', async () => {
    const client = new Client({ connectionString: tenantConnectionString(restored) })
    await client.connect()
    try {
      const { rows } = await client.query<{ created_at: string }>(
        `SELECT created_at::text FROM artists WHERE name = 'Miles Davis'`
      )
      expect(rows[0].created_at).toContain('.000001')
    } finally {
      await client.end()
    }
  })

  it('escapes apostrophes in both data and text fields', async () => {
    const client = new Client({ connectionString: tenantConnectionString(restored) })
    await client.connect()
    try {
      const { rows: artists } = await client.query(
        `SELECT name FROM artists WHERE name = 'Guns N'' Roses'`
      )
      expect(artists).toHaveLength(1)
      const { rows: releases } = await client.query(
        `SELECT notes FROM releases WHERE notes LIKE '%apostrophe%'`
      )
      expect(releases[0].notes).toBe("A note with ' an apostrophe")
    } finally {
      await client.end()
    }
  })

  it('advances sequences past the restored rows so the next insert does not collide', async () => {
    const client = new Client({ connectionString: tenantConnectionString(restored) })
    await client.connect()
    try {
      const { rows: before } = await client.query<{ max: number }>(
        'SELECT max(artist_id)::int AS max FROM artists'
      )
      const { rows: inserted } = await client.query<{ artist_id: number }>(
        `INSERT INTO artists (name, sort_name) VALUES ('Probe', 'Probe') RETURNING artist_id`
      )
      expect(inserted[0].artist_id).toBeGreaterThan(before[0].max)
    } finally {
      await client.end()
    }
  })

  it('refuses to export rather than silently omit an unknown table', async () => {
    await runSqlOnScratchDatabase(source, 'CREATE TABLE stowaway (id int)')
    try {
      await expect(buildTenantSqlExport(source)).rejects.toThrow(/stowaway/)
    } finally {
      await runSqlOnScratchDatabase(source, 'DROP TABLE stowaway')
    }
  }, 30000)
})
