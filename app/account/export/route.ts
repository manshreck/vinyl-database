import { requireSession } from '@/lib/session'
import { buildTenantSqlExport } from '@/lib/exportTenant'

/** Filenames sort chronologically, so a folder of exports reads as a history. */
function exportFilename(generatedAt: Date): string {
  return `vinyl-collection-${generatedAt.toISOString().slice(0, 10)}.sql`
}

export async function GET() {
  // Redirects to /login when signed out, which is the right response to a browser
  // navigation — this is a link the user clicks, not an XHR.
  const session = await requireSession()

  const generatedAt = new Date()
  const sql = await buildTenantSqlExport(session.databaseName, generatedAt)

  return new Response(sql, {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(generatedAt)}"`,
      // Every download should reflect the collection as it stands right now.
      'Cache-Control': 'no-store',
    },
  })
}
