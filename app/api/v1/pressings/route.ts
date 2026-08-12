import { apiError } from '@/lib/apiError'
import { getTenantPrisma } from '@/lib/prisma'
import { getCollection, getCollectionVersion } from '@/lib/services/collection'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

/**
 * The whole collection, in one request (MOBILE_APP_PLAN §5, D5).
 *
 * No pagination and no filters by design: a client holding the full cache filters
 * locally for free, and the collection is small enough that paging would add a
 * permanent contract for no benefit. Both are additive later if a screen demands them.
 *
 * There is nothing to validate here — no body, no query params — so no zod yet. It
 * arrives with the first endpoint that actually takes input.
 */

/** Matches an `If-None-Match` list against our tag, tolerating `W/` and multiple values. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  return header
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .includes(etag)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return apiError(401, 'not_authenticated', 'Not signed in.')

  // The tenant client comes from the session and never from the request, which is what
  // makes cross-tenant access structurally impossible rather than a check to remember.
  const prisma = await getTenantPrisma(session.databaseName)

  // Cheap read first: if the caller's copy is current, say so without building the
  // payload at all. This is the common case on app launch.
  const etag = `"${await getCollectionVersion(prisma)}"`
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  const collection = await getCollection(prisma)

  return NextResponse.json(collection, {
    headers: {
      // Built from the same snapshot as the body, so the tag always describes what
      // was actually sent.
      ETag: `"${collection.version}"`,
      // Cache, but revalidate every time — the 304 above is what makes that cheap.
      'Cache-Control': 'private, no-cache',
    },
  })
}
