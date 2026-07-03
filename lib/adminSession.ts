import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createAdminSession,
  deleteAdminSessionByTokenHash,
  findAdminSession,
} from '@/lib/controlDb'

const COOKIE_NAME = 'admin_session'
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000 // 12 hours

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Returns true if the admin session cookie is present and valid. */
export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false

  const session = await findAdminSession(hashToken(token))
  return session !== null
}

/** Like getAdminSession(), but redirects to /admin/login when there is no valid session. */
export async function requireAdminSession(): Promise<void> {
  const valid = await getAdminSession()
  if (!valid) redirect('/admin/login')
}

/** Creates an admin session row in the control DB and sets the admin session cookie. */
export async function createAdminSessionCookie(): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await createAdminSession(hashToken(token), expiresAt)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

/** Deletes the current admin session (control DB row + cookie). */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) await deleteAdminSessionByTokenHash(hashToken(token))
  cookieStore.delete(COOKIE_NAME)
}
