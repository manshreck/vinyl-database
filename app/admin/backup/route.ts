import { requireAdminSession } from '@/lib/adminSession'
import { buildSystemBackup } from '@/lib/exportSystem'

export async function GET() {
  // Same gate as the admin dashboard; redirects to the admin login when signed out,
  // which is the right response to a browser navigation.
  await requireAdminSession()

  const generatedAt = new Date()
  const sql = await buildSystemBackup(generatedAt)
  const filename = `vinyl-full-backup-${generatedAt.toISOString().slice(0, 10)}.sql`

  return new Response(sql, {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
