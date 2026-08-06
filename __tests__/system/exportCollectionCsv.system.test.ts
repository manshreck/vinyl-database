/**
 * @jest-environment node
 *
 * System integration test: buildCollectionCsv against a real Postgres database, with
 * the output parsed back to prove it survives the round trip. See TESTING.md §2.4.
 *
 * Justified by a gap smaller tests can't cover: CSV's failure mode is silent
 * corruption, not an error. A field carrying an unescaped comma or quote shifts every
 * later column on that row, and the file still opens cleanly — it is simply wrong.
 * Real collections contain exactly these characters (vinyl colors like
 * `Red / Yellow "Blazing Galaxy"`, notes spanning lines), so the seed data does too,
 * and the assertion is that a parser recovers the original values.
 */
import {
  generateScratchSchemaName,
  createScratchSchema,
  dropScratchSchema,
  applyTenantSchema,
  runSqlOnScratchSchema,
} from '@/test-support/db/scratchSchema'
import { buildCollectionCsv } from '@/lib/exportCollectionCsv'

/** Every hazard present in the real collection, plus a newline for good measure. */
const SEED_SQL = `
INSERT INTO genres (name) VALUES ('Jazz'), ('Rock');
INSERT INTO formats (name) VALUES ('LP');
INSERT INTO artists (name, sort_name) VALUES
  ('Janelle Monáe', 'Monáe, Janelle'),
  ('Aphex Twin', 'Aphex Twin');
INSERT INTO releases (title, original_release_year) VALUES
  ('The ArchAndroid', 2010),
  ('Selected Ambient Works', 1992);
INSERT INTO release_artists (release_id, artist_id, artist_order, role) VALUES
  (1, 1, 1, 'Primary Artist'), (2, 2, 1, 'Primary Artist');
INSERT INTO release_genres (release_id, genre_id, genre_order) VALUES (1, 1, 1), (1, 2, 2);
INSERT INTO pressings
  (release_id, format_id, pressing_year, country, label, catalog_number, vinyl_color,
   disc_count, record_condition, sleeve_condition, notes, purchase_price, purchase_date, current_value)
VALUES
  (1, 1, 2010, 'US', 'Bad Boy', '075678584206', 'Red / Yellow "Blazing Galaxy"',
   2, 'NM', 'VG+', 'Note with, a comma', 42.50, '2024-01-15', 199.99),
  (2, 1, 1992, 'UK', 'Apollo', 'AMB3922', 'Clear w/ Blue, Orange, and Green Splatter',
   1, 'VG+', NULL, E'Line one\nLine two', NULL, NULL, NULL);
`

/** Minimal RFC 4180 reader — deliberately not the writer's own logic. */
function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inQuotes) {
      if (c === '"' && body[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r' && body[i + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; i++
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

describe('buildCollectionCsv (system)', () => {
  const db = generateScratchSchemaName()
  let csv: string
  let rows: string[][]

  beforeAll(async () => {
    await createScratchSchema(db)
    await applyTenantSchema(db)
    await runSqlOnScratchSchema(db, SEED_SQL)
    csv = await buildCollectionCsv(db)
    rows = parseCsv(csv)
  }, 60000)

  afterAll(async () => {
    await dropScratchSchema(db)
  }, 30000)

  it('starts with a UTF-8 BOM so spreadsheets read accents correctly', () => {
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('has a header row and one row per pressing', () => {
    expect(rows[0][0]).toBe('Artist')
    expect(rows).toHaveLength(3)
  })

  it('sorts by artist sort name, as the collection page does', () => {
    expect(rows[1][0]).toBe('Aphex Twin')
    expect(rows[2][0]).toBe('Janelle Monáe')
  })

  it('survives a value containing quotes without shifting later columns', () => {
    const monae = rows[2]
    expect(monae[8]).toBe('Red / Yellow "Blazing Galaxy"')
    // The column after the hazard must still be itself, not a fragment of it.
    expect(monae[9]).toBe('2')
    expect(monae[10]).toBe('NM')
  })

  it('survives values containing commas and newlines', () => {
    expect(rows[1][8]).toBe('Clear w/ Blue, Orange, and Green Splatter')
    expect(rows[1][16]).toBe('Line one\nLine two')
    expect(rows[2][16]).toBe('Note with, a comma')
  })

  it('keeps a leading-zero catalog number intact in the file itself', () => {
    expect(rows[2][7]).toBe('075678584206')
  })

  it('writes condition grades as collectors write them, not as enum names', () => {
    expect(rows[1][10]).toBe('VG+')
    expect(rows[1][11]).toBe('')
  })

  it('flattens multi-value genres into one field', () => {
    expect(rows[2][12]).toBe('Jazz, Rock')
  })

  it('renders money and dates plainly, and empties as empty', () => {
    // Cast to text in SQL, so the stored scale survives — 42.50, not 42.5.
    expect(rows[2][13]).toBe('42.50')
    expect(rows[2][14]).toBe('2024-01-15')
    expect(rows[2][15]).toBe('199.99')
    expect(rows[1][13]).toBe('')
    expect(rows[1][14]).toBe('')
  })

  it('exports a header-only file for an empty collection', async () => {
    const empty = generateScratchSchemaName()
    await createScratchSchema(empty)
    await applyTenantSchema(empty)
    try {
      const parsed = parseCsv(await buildCollectionCsv(empty))
      expect(parsed).toHaveLength(1)
      expect(parsed[0][0]).toBe('Artist')
    } finally {
      await dropScratchSchema(empty)
    }
  }, 60000)
})
