import { getSession } from '@/lib/session'
import { DiscogsApiError, getDiscogsRelease, resolveDiscogsToken, searchDiscogsReleases } from '@/lib/discogs'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const title = (request.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (request.nextUrl.searchParams.get('artist') ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

  const token = resolveDiscogsToken(session.discogsToken)

  try {
    const results = await searchDiscogsReleases([artist, title].filter(Boolean).join(' '), token)
    const match = results[0]
    if (!match) return NextResponse.json({ coverImageUrl: null })

    const release = await getDiscogsRelease(match.id, token)
    return NextResponse.json({ coverImageUrl: release.coverImageUrl })
  } catch (err) {
    const message = err instanceof DiscogsApiError ? err.message : 'Could not retrieve a cover image.'
    // Distinct from this route's own 401 (no app session): this one means Discogs
    // refused the token, so the caller can point at the Account page.
    const tokenRejected = err instanceof DiscogsApiError && err.unauthorized
    return NextResponse.json({ error: message, tokenRejected }, { status: 502 })
  }
}
