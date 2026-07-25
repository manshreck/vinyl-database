import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import searchKindOfBlue from './fixtures/search-kind-of-blue.json'
import release2825456 from './fixtures/release-2825456.json'
import master5460 from './fixtures/master-5460.json'

const DISCOGS_API_BASE = 'https://api.discogs.com'

/**
 * Fake Discogs HTTP server (MSW), standing in for api.discogs.com in tests.
 * Fixtures are real captured responses — see fixtures/*.json. Update the fixtures
 * whenever lib/discogs.ts or lib/discogsMapping.ts changes what it reads from a
 * response, and re-run __tests__/contract/discogs.contract.test.ts to confirm the
 * fixtures still match Discogs' real shape (see swe-test-doubles: a fake cannot
 * detect its own drift — only a contract test against the real thing can).
 *
 * Unrecognized ids fail fast (404) rather than silently returning nothing, per the
 * "fakes should fail fast on unsupported paths" rule.
 */
const FIXTURE_RELEASES: Record<string, unknown> = {
  '2825456': release2825456,
}

const FIXTURE_MASTERS: Record<string, unknown> = {
  '5460': master5460,
}

export const discogsHandlers = [
  http.get(`${DISCOGS_API_BASE}/database/search`, () => HttpResponse.json(searchKindOfBlue)),

  http.get(`${DISCOGS_API_BASE}/releases/:id`, ({ params }) => {
    const release = FIXTURE_RELEASES[params.id as string]
    if (!release) {
      return HttpResponse.json({ message: `No fixture for release ${params.id}` }, { status: 404 })
    }
    return HttpResponse.json(release)
  }),

  http.get(`${DISCOGS_API_BASE}/masters/:id`, ({ params }) => {
    const master = FIXTURE_MASTERS[params.id as string]
    if (!master) {
      return HttpResponse.json({ message: `No fixture for master ${params.id}` }, { status: 404 })
    }
    return HttpResponse.json(master)
  }),
]

export const discogsServer = setupServer(...discogsHandlers)
