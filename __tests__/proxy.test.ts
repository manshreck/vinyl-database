/**
 * @jest-environment node
 *
 * The proxy decides, for every request, whether it is even allowed to reach the app.
 * Its matcher is a single hand-written negative-lookahead regex, which is precisely
 * the sort of expression that keeps working while quietly meaning something new: a
 * missing alternative locks out a whole transport, an extra one silently unguards a
 * page. Neither shows up as an error anywhere.
 *
 * These tests pin both halves — which paths the gate applies to, and what it does
 * when it applies.
 */
import { NextRequest } from 'next/server'
import proxy, { config } from '@/proxy'

/** The matcher as Next applies it: anchored against the request path. */
const matcher = new RegExp(`^${config.matcher[0]}$`)

const gated = (path: string) => matcher.test(path)

describe('proxy matcher', () => {
  it('gates the pages that hold collection data', () => {
    expect(gated('/')).toBe(true)
    expect(gated('/pressings')).toBe(true)
    expect(gated('/pressings/12/edit')).toBe(true)
    expect(gated('/wishlist')).toBe(true)
    expect(gated('/account')).toBe(true)
  })

  it('leaves the unauthenticated entry points reachable', () => {
    expect(gated('/login')).toBe(false)
    expect(gated('/register')).toBe(false)
  })

  it('leaves /admin to its own separate session check', () => {
    expect(gated('/admin')).toBe(false)
  })

  // The cookie-presence gate cannot see a bearer token, so applying it to /api would
  // bounce every mobile request to an HTML login page. The handlers authenticate
  // themselves and answer 401 in JSON instead.
  it('does not gate API routes, which authenticate themselves', () => {
    expect(gated('/api/v1/auth/session')).toBe(false)
    expect(gated('/api/artists/search')).toBe(false)
    expect(gated('/api/discogs/cover-image')).toBe(false)
  })

  // Regression: next/image's optimizer re-fetches local sources through an internal
  // server-side request carrying no cookies. Gating those broke image rendering for
  // users who were in fact logged in.
  it('does not gate static assets or image sources', () => {
    expect(gated('/_next/static/chunk.js')).toBe(false)
    expect(gated('/_next/image')).toBe(false)
    expect(gated('/favicon.ico')).toBe(false)
    expect(gated('/spot-illustration.png')).toBe(false)
    expect(gated('/covers/kind-of-blue.jpg')).toBe(false)
  })
})

describe('proxy handler', () => {
  it('redirects to /login when no session cookie is present', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/pressings'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('lets a request through when a session cookie is present', async () => {
    const request = new NextRequest('http://localhost:3000/pressings')
    request.cookies.set('session', 'sometoken')

    const response = await proxy(request)

    // Presence only — validity is decided by getSession() against the database.
    expect(response.headers.get('location')).toBeNull()
    expect(response.status).toBe(200)
  })
})
