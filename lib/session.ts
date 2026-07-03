import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createSession as createControlSession,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  updateLastLogin,
} from '@/lib/controlDb'

const COOKIE_NAME = 'session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type Session = {
  userId: number
  email: string
  databaseName: string
}

/** Reads and validates the session cookie against the control DB. Returns null if absent/invalid/expired. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const session = await findSessionByTokenHash(hashToken(token))
  if (!session) return null

  return { userId: session.userId, email: session.email, databaseName: session.databaseName }
}

/** Like getSession(), but redirects to /login when there is no valid session. For pages and Server Actions only. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** Creates a session row in the control DB and sets the session cookie. */
export async function createSessionCookie(userId: number): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await createControlSession(userId, hashToken(token), expiresAt)
  await updateLastLogin(userId)

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
  if (token) await deleteSessionByTokenHash(hashToken(token))
  cookieStore.delete(COOKIE_NAME)
}
