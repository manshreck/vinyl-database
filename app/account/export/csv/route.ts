import { requireSession } from '@/lib/session'
import { buildCollectionCsv } from '@/lib/exportCollectionCsv'

export async function GET() {
  // Redirects to /login when signed out — this is a link the user clicks, not an XHR.
  const session = await requireSession()

  const csv = await buildCollectionCsv(session.databaseName)
  const filename = `vinyl-collection-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
