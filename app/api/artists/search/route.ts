import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])

  const artists = await prisma.artist.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    orderBy: { sortName: 'asc' },
    take: 10,
  })

  return NextResponse.json(artists)
}
