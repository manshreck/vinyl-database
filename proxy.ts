import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'session'

// Cheap, cookie-presence-only check. The authoritative check (session validity,
// expiry, tenant resolution) happens once per request anyway inside
// requireSession()/getSession() (see lib/session.ts) — duplicating a DB lookup
// here would just double the round-trips with no additional security benefit.
export default async function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE)

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

// /admin routes have their own session (admin_session) and are gated separately
// by requireAdminSession() inside app/admin/page.tsx, not by this user-session check.
//
// Static files under public/ (images, etc.) must also be excluded — not just for the
// browser's sake, but because next/image's optimizer re-fetches local image sources
// through an internal server-side request that carries no cookies. Without this
// exclusion, that internal fetch gets redirected to /login by this same proxy and
// next/image fails with "The requested resource isn't a valid image," regardless of
// whether the end user is actually logged in.
export const config = {
  matcher: [
    '/((?!login|register|admin|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico)$).*)',
  ],
}
