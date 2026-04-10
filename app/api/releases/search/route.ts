import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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
