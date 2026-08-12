/**
 * @jest-environment node
 *
 * System integration test: the /api/v1/auth/session route handler assembling the real
 * accounts service + real session module + real controlDb against a real scratch
 * control schema. See TESTING.md §2.4.
 *
 * Justified by what only emerges from the assembly. The unit tests in
 * __tests__/lib/session.test.ts prove the *policy* — bearer beats cookie, mobile
 * slides, web doesn't — against a mocked controlDb, so they cannot see whether the
 * token a client is handed actually resolves later, or whether the renewal UPDATE
 * really moves `expires_at` in Postgres. Both are round-trips across three modules
 * and the database, and both are the kind of thing that fails silently: a login that
 * returns a token nobody can use still looks like a 201.
 *
 * `next/headers` is doubled because there is no Next.js request context in Jest; the
 * bearer path is what this test drives, and it reads that one header.
 */
import { Client } from 'pg'
import { NextRequest } from 'next/server'
import {
  createScratchSchema,
  dropScratchSchema,
  generateScratchSchemaName,
} from '@/test-support/db/scratchSchema'
import { resetControlDbGlobals } from '@/test-support/db/controlDbGlobals'
import { schemaConnectionConfig } from '@/lib/dbUrls'

const mockHeaderStore = { get: jest.fn() }
const mockCookieStore = { get: jest.fn(), set: jest.fn(), delete: jest.fn() }

jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(mockHeaderStore)),
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}))

type ControlDbModule = typeof import('@/lib/controlDb')
type SessionModule = typeof import('@/lib/session')
type RouteModule = typeof import('@/app/api/v1/auth/session/route')

const EMAIL = 'system-auth@vinyl-test.local'
const PASSWORD = 'longenoughpassword'
const DAY_MS = 24 * 60 * 60 * 1000

function postJson(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('auth session route assembling real session + controlDb (system)', () => {
  let controlSchema: string
  let controlDb: ControlDbModule
  let session: SessionModule
  let route: RouteModule
  let userId: number

  beforeAll(async () => {
    controlSchema = generateScratchSchemaName()
    await createScratchSchema(controlSchema)

    await resetControlDbGlobals()
    jest.resetModules()
    process.env.CONTROL_SCHEMA = controlSchema

    // Loaded in one post-reset registry so the route, session and controlDb all
    // resolve to the same instance bound to the scratch schema above.
    controlDb = await import('@/lib/controlDb')
    session = await import('@/lib/session')
    route = await import('@/app/api/v1/auth/session/route')

    const { hashPassword } = await import('@/lib/password')
    // Straight to controlDb rather than through registration: this test is about
    // authentication, and provisioning a tenant schema it never queries is cost
    // without coverage.
    const user = await controlDb.createUser(EMAIL, hashPassword(PASSWORD), 'vinyl_user_authtest')
    userId = user.id
  }, 30000)

  afterAll(async () => {
    await resetControlDbGlobals()
    await dropScratchSchema(controlSchema)
  }, 30000)

  beforeEach(() => {
    jest.clearAllMocks()
    mockHeaderStore.get.mockReturnValue(null)
    mockCookieStore.get.mockReturnValue(undefined)
  })

  /** Reads expires_at straight from the scratch schema, bypassing the app entirely. */
  async function storedExpiry(tokenHash: string): Promise<Date | null> {
    const client = new Client(schemaConnectionConfig(controlSchema))
    await client.connect()
    try {
      const { rows } = await client.query(
        'SELECT expires_at FROM sessions WHERE token_hash = $1',
        [tokenHash]
      )
      return rows[0]?.expires_at ?? null
    } finally {
      await client.end()
    }
  }

  it('issues a token that actually resolves to the signed-in user', async () => {
    const response = await route.POST(postJson({ email: EMAIL, password: PASSWORD }))
    expect(response.status).toBe(201)

    const { token } = await response.json()
    expect(typeof token).toBe('string')

    // The round-trip the unit tests cannot see: hand the token back the way a phone
    // would and confirm the server recognises it.
    mockHeaderStore.get.mockReturnValue(`Bearer ${token}`)
    const resolved = await session.getSession()

    expect(resolved).not.toBeNull()
    expect(resolved!.userId).toBe(userId)
    expect(resolved!.email).toBe(EMAIL)
    // Logging in over HTTP is what makes it a mobile session, and therefore sliding.
    expect(resolved!.origin).toBe('mobile')
  })

  it('rejects a wrong password without issuing anything', async () => {
    const response = await route.POST(postJson({ email: EMAIL, password: 'wrongpassword' }))

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.token).toBeUndefined()
    // Asserting the code, not the prose. The message is allowed to be reworded; the
    // code is the part clients branch on and therefore the part that is contract.
    expect(body.error.code).toBe('invalid_credentials')
  })

  it('reports an unknown address identically to a wrong password', async () => {
    const response = await route.POST(
      postJson({ email: 'nobody@vinyl-test.local', password: 'wrongpassword' })
    )
    const body = await response.json()

    // Same status, same code, same message: distinguishing them would make this
    // endpoint an account-enumeration oracle, and a distinct *code* would leak it to
    // machines even if the prose matched.
    expect(response.status).toBe(401)
    expect(body.error.code).toBe('invalid_credentials')
    expect(body.error.message).toBe('Incorrect email or password.')
  })

  // The D8 envelope is what mobile compiles its error handling against, so its shape
  // is pinned across every failure path rather than at one convenient example.
  it('returns the D8 error envelope from every failure path', async () => {
    const cases: Array<[Promise<Response>, number, string]> = [
      [
        Promise.resolve(route.POST(postJson({ email: EMAIL }))),
        400,
        'invalid_request',
      ],
      [
        Promise.resolve(
          route.POST(
            new NextRequest('http://localhost/api/v1/auth/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: 'not json',
            })
          )
        ),
        400,
        'invalid_request_body',
      ],
      [
        Promise.resolve(
          route.DELETE(
            new NextRequest('http://localhost/api/v1/auth/session', { method: 'DELETE' })
          )
        ),
        401,
        'missing_bearer_token',
      ],
      [Promise.resolve(route.GET()), 401, 'not_authenticated'],
    ]

    for (const [pending, status, code] of cases) {
      const response = await pending
      const body = await response.json()

      expect(response.status).toBe(status)
      expect(body.error.code).toBe(code)
      expect(typeof body.error.message).toBe('string')
      expect(body.error.message.length).toBeGreaterThan(0)
      // No bare `error` string survives anywhere — that was the pre-D8 shape.
      expect(typeof body.error).toBe('object')
    }
  })

  it('renewal moves expires_at in the database, not just in memory', async () => {
    const response = await route.POST(postJson({ email: EMAIL, password: PASSWORD }))
    const { token } = await response.json()

    const { createHash } = await import('crypto')
    const tokenHash = createHash('sha256').update(token).digest('hex')

    // Age the session past the once-a-day renewal threshold. Backdating the stored
    // expiry is equivalent to time passing, and needs no clock control.
    const client = new Client(schemaConnectionConfig(controlSchema))
    await client.connect()
    await client.query(
      `UPDATE sessions SET expires_at = now() + interval '20 days' WHERE token_hash = $1`,
      [tokenHash]
    )
    await client.end()

    const before = await storedExpiry(tokenHash)
    mockHeaderStore.get.mockReturnValue(`Bearer ${token}`)
    await session.getSession()
    const after = await storedExpiry(tokenHash)

    expect(after!.getTime()).toBeGreaterThan(before!.getTime())
    // Back to a full window, not merely nudged.
    expect(after!.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS)
  })

  it('logout revokes the token for good', async () => {
    const response = await route.POST(postJson({ email: EMAIL, password: PASSWORD }))
    const { token } = await response.json()

    const del = await route.DELETE(
      new NextRequest('http://localhost/api/v1/auth/session', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
    )
    expect(del.status).toBe(204)

    mockHeaderStore.get.mockReturnValue(`Bearer ${token}`)
    expect(await session.getSession()).toBeNull()
  })

  it('logout is idempotent — a second call still reports success', async () => {
    const del = await route.DELETE(
      new NextRequest('http://localhost/api/v1/auth/session', {
        method: 'DELETE',
        headers: { authorization: 'Bearer neverexistedatall' },
      })
    )
    expect(del.status).toBe(204)
  })
})
