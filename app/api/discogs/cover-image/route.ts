import { getSession } from '@/lib/session'
import { DiscogsApiError, getDiscogsRelease, searchDiscogsReleases } from '@/lib/discogs'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const title = (request.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (request.nextUrl.searchParams.get('artist') ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

  try {
    const results = await searchDiscogsReleases([artist, title].filter(Boolean).join(' '))
    const match = results[0]
    if (!match) return NextResponse.json({ coverImageUrl: null })

    const release = await getDiscogsRelease(match.id)
    return NextResponse.json({ coverImageUrl: release.coverImageUrl })
  } catch (err) {
    const message = err instanceof DiscogsApiError ? err.message : 'Could not retrieve a cover image.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
