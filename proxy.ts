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
export const config = {
  matcher: ['/((?!login|register|admin|_next/static|_next/image|favicon.ico).*)'],
}
