import { createHash, randomBytes } from 'crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createSession as createControlSession,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  touchSession,
  updateLastLogin,
  type SessionOrigin,
} from '@/lib/controlDb'

export type { SessionOrigin }

const COOKIE_NAME = 'session'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long a session lives, per transport.
 *
 * The web keeps a fixed 30 days: a browser session on a possibly-shared machine
 * should lapse on a predictable schedule regardless of use.
 *
 * Mobile slides. A phone is a personal, lock-screened device and re-typing a
 * password on it is miserable, so an app in regular use should never sign itself
 * out — but a *long fixed* TTL buys that at the price of a token on a lost phone
 * staying valid for its whole term. Renewing a 30-day window on use gets both:
 * indefinite for an active device, dead 30 days after the last use for an idle one.
 */
const SESSION_POLICY: Record<SessionOrigin, { ttlMs: number; sliding: boolean }> = {
  web: { ttlMs: 30 * DAY_MS, sliding: false },
  mobile: { ttlMs: 30 * DAY_MS, sliding: true },
}

/**
 * Only renew once the session has burned through this much of its window, so a
 * sliding session costs at most one UPDATE per day rather than one per request.
 */
const BUMP_AFTER_MS = 1 * DAY_MS

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type Session = {
  userId: number
  email: string
  databaseName: string
  discogsToken: string | null
  fullName: string | null
  origin: SessionOrigin
}

/**
 * Mints a session and returns the raw token — once. Only the hash is stored, so
 * this is the sole moment the token exists in readable form; whoever calls this
 * is responsible for handing it to the client (a cookie on the web, a JSON body
 * over HTTP). Deliberately free of cookies and redirects so both can use it.
 */
export async function issueSession(
  userId: number,
  origin: SessionOrigin = 'web'
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_POLICY[origin].ttlMs)

  await createControlSession(userId, hashToken(token), expiresAt, origin)
  await updateLastLogin(userId)

  return { token, expiresAt }
}

/**
 * Validates a raw token, renewing it when its policy slides. Returns null for
 * absent, unknown, or expired tokens — the caller decides what that means.
 */
export async function resolveSessionToken(token: string): Promise<Session | null> {
  const tokenHash = hashToken(token)
  const session = await findSessionByTokenHash(tokenHash)
  if (!session) return null

  const policy = SESSION_POLICY[session.origin] ?? SESSION_POLICY.web
  if (policy.sliding) {
    const now = Date.now()
    const elapsed = policy.ttlMs - (session.expiresAt.getTime() - now)
    if (elapsed >= BUMP_AFTER_MS) {
      await touchSession(tokenHash, new Date(now + policy.ttlMs))
    }
  }

  return {
    userId: session.userId,
    email: session.email,
    databaseName: session.databaseName,
    discogsToken: session.discogsToken,
    fullName: session.fullName,
    origin: session.origin,
  }
}

/** Revokes a session by its raw token. Unknown tokens are a no-op, not an error. */
export async function revokeSessionToken(token: string): Promise<void> {
  await deleteSessionByTokenHash(hashToken(token))
}

/** `Authorization: Bearer <token>`, or null when absent or another scheme. */
async function bearerToken(): Promise<string | null> {
  const header = (await headers()).get('authorization')
  if (!header) return null
  const match = /^Bearer +(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/**
 * Reads and validates the current session, from either transport.
 *
 * The bearer header wins over the cookie when both are present: an explicit
 * credential on the request is a clearer statement of intent than whatever the
 * browser happened to attach, and it keeps a stray cookie from silently deciding
 * which account an API call runs as.
 */
export async function getSession(): Promise<Session | null> {
  const bearer = await bearerToken()
  if (bearer) return resolveSessionToken(bearer)

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  return resolveSessionToken(token)
}

/** Like getSession(), but redirects to /login when there is no valid session. For pages and Server Actions only. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** Creates a session row in the control DB and sets the session cookie. */
export async function createSessionCookie(userId: number): Promise<void> {
  const { token, expiresAt } = await issueSession(userId, 'web')

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

/** Deletes the current session (control DB row + cookie). */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) await revokeSessionToken(token)
  cookieStore.delete(COOKIE_NAME)
}
