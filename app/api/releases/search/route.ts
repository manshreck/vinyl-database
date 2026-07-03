import { getTenantPrisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const prisma = await getTenantPrisma(session.databaseName)

  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])

  const releases = await prisma.release.findMany({
    where: { title: { contains: q, mode: 'insensitive' } },
    include: {
      artists: {
        include: { artist: true },
        orderBy: { artistOrder: 'asc' },
      },
    },
    orderBy: { title: 'asc' },
    take: 10,
  })

  return NextResponse.json(releases)
}
