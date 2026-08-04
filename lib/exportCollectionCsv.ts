import { Client } from 'pg'
import { tenantConnectionString } from '@/lib/dbUrls'
import { artistSortKey } from '@/lib/artistSort'

/**
 * Excel decides a file's encoding by sniffing, and without this guesses the local
 * codepage — turning "Janelle Monáe" into "Janelle MonÃ©e". A UTF-8 byte-order mark
 * settles it. Other tools treat a leading BOM as whitespace or strip it, so this
 * costs nothing elsewhere.
 */
const UTF8_BOM = '﻿'

const COLUMNS = [
  'Artist',
  'Title',
  'Original Release Year',
  'Format',
  'Pressing Year',
  'Country',
  'Label',
  'Catalog Number',
  'Vinyl Color',
  'Discs',
  'Record Condition',
  'Sleeve Condition',
  'Genres',
  'Purchase Price',
  'Purchase Date',
  'Current Value',
  'Notes',
]

/**
 * One row per pressing, with release, artist and genres folded in, and money and dates
 * cast to text so they arrive exactly as stored rather than via a JS Date or float.
 *
 * Conditions come back as the enum's database labels ("VG+", not the Prisma name
 * "VG_PLUS"), which is already the form a collector writes.
 */
const COLLECTION_QUERY = `
  SELECT
    (SELECT string_agg(a.name, ', ' ORDER BY ra.artist_order)
       FROM release_artists ra JOIN artists a ON a.artist_id = ra.artist_id
      WHERE ra.release_id = r.release_id) AS artist_names,
    (SELECT a.sort_name
       FROM release_artists ra JOIN artists a ON a.artist_id = ra.artist_id
      WHERE ra.release_id = r.release_id
      ORDER BY ra.artist_order LIMIT 1) AS primary_sort_name,
    r.title,
    r.original_release_year,
    f.name AS format_name,
    p.pressing_year,
    p.country,
    p.label,
    p.catalog_number,
    p.vinyl_color,
    p.disc_count,
    p.record_condition::text AS record_condition,
    p.sleeve_condition::text AS sleeve_condition,
    (SELECT string_agg(g.name, ', ' ORDER BY rg.genre_order)
       FROM release_genres rg JOIN genres g ON g.genre_id = rg.genre_id
      WHERE rg.release_id = r.release_id) AS genre_names,
    p.purchase_price::text AS purchase_price,
    p.purchase_date::text AS purchase_date,
    p.current_value::text AS current_value,
    p.notes
  FROM pressings p
  JOIN releases r ON r.release_id = p.release_id
  JOIN formats  f ON f.format_id  = p.format_id
`

type CollectionRow = Record<string, string | number | null>

/**
 * Quotes per RFC 4180: any field containing a comma, quote or newline is wrapped, and
 * embedded quotes are doubled. All three occur in real collections — vinyl colors like
 * `Red, Clear (White) & Blue` and `Red / Yellow "Blazing Galaxy"`, and notes spanning
 * lines — and each would otherwise shift every later column on that row.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',')
}

/**
 * The collection as one flat table, for opening in a spreadsheet or importing
 * elsewhere. Deliberately denormalized — that is the point of a CSV, and the reason
 * it complements rather than replaces the .sql export, which preserves the structure.
 *
 * Uses a short-lived connection rather than the cached tenant client: an export is a
 * one-shot operation, and has no reason to populate a pool kept warm for 30 minutes.
 */
export async function buildCollectionCsv(databaseName: string): Promise<string> {
  const client = new Client({ connectionString: tenantConnectionString(databaseName) })
  await client.connect()

  try {
    const { rows } = await client.query<CollectionRow>(COLLECTION_QUERY)

    // Same order as the collection page, so the file reads the way the app looks.
    rows.sort((a, b) => {
      const artistCmp = artistSortKey(String(a.primary_sort_name ?? '')).localeCompare(
        artistSortKey(String(b.primary_sort_name ?? ''))
      )
      if (artistCmp !== 0) return artistCmp
      const titleCmp = String(a.title).localeCompare(String(b.title))
      if (titleCmp !== 0) return titleCmp
      return Number(a.pressing_year ?? 0) - Number(b.pressing_year ?? 0)
    })

    const lines = rows.map((r) =>
      csvRow([
        r.artist_names,
        r.title,
        r.original_release_year,
        r.format_name,
        r.pressing_year,
        r.country,
        r.label,
        r.catalog_number,
        r.vinyl_color,
        r.disc_count,
        r.record_condition,
        r.sleeve_condition,
        r.genre_names,
        r.purchase_price,
        r.purchase_date,
        r.current_value,
        r.notes,
      ])
    )

    // CRLF is what RFC 4180 specifies and what Excel is happiest with; every other
    // parser accepts it.
    return UTF8_BOM + [csvRow(COLUMNS), ...lines].join('\r\n') + '\r\n'
  } finally {
    await client.end()
  }
}
