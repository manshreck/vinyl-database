import { authenticate } from '@/lib/services/accounts'
import { getSession, issueSession, revokeSessionToken } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

/**
 * The bearer-token half of authentication, for clients that have no cookie jar.
 *
 * Registration deliberately has no endpoint here: creating an account provisions a
 * tenant schema and is a once-per-user act, so it stays on the web where the flow
 * already exists rather than being duplicated on a surface that cannot be as
 * carefully guarded.
 *
 * Note this path is inherently CSRF-immune — the credential is an explicit header,
 * never an ambient cookie a third-party page could cause the client to attach.
 */

type LoginBody = { email?: unknown; password?: unknown }

/** POST — exchange email and password for a session token. */
export async function POST(request: NextRequest) {
  let body: LoginBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  const { email, password } = body
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json(
      { error: 'Both "email" and "password" are required and must be strings.' },
      { status: 400 }
    )
  }

  const result = await authenticate(email, password)
  if (result.status === 'invalid_credentials') {
    // Same message whether the address is unknown or the password is wrong: telling
    // them apart would turn this endpoint into an account-enumeration oracle.
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
  }

  const { token, expiresAt } = await issueSession(result.userId, 'mobile')

  // The only time the raw token is ever readable — the server keeps just its hash.
  return NextResponse.json({ token, expiresAt: expiresAt.toISOString() }, { status: 201 })
}

/** DELETE — revoke the token presented in the Authorization header. */
export async function DELETE(request: NextRequest) {
  const match = /^Bearer +(\S+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')
  if (!match) {
    return NextResponse.json(
      { error: 'Provide the session token as "Authorization: Bearer <token>".' },
      { status: 401 }
    )
  }

  await revokeSessionToken(match[1])

  // No content, and no complaint if the token was already gone: logout is idempotent,
  // so a client retrying after a dropped connection still ends up signed out.
  return new NextResponse(null, { status: 204 })
}

/** GET — who am I? Lets a client check a stored token without mutating anything. */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    origin: session.origin,
  })
}
