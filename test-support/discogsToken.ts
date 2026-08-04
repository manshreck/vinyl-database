/**
 * Shared gate for the tests that need a real Discogs API token.
 *
 * Most of the suite never needs one — MSW intercepts Discogs calls and serves
 * test-support/fakes/fixtures/*.json, so no request leaves the process. Only two
 * places genuinely talk to Discogs: the contract test that keeps those fixtures
 * honest, and the one e2e journey that exercises Discogs prefill. Both skip without
 * a token rather than failing, so a contributor can clone and run the suite green.
 */

/**
 * Values that look like a token but aren't one. Without this, copying .env.example to
 * .env would make DISCOGS_TOKEN truthy and turn a clean skip into a 401 failure —
 * exactly the confusing breakage the skip exists to prevent.
 */
const PLACEHOLDERS = new Set([
  'testtoken',
  'changeme',
  'xxx',
  // Every placeholder our own docs have ever suggested typing.
  'your-discogs-token',
  'your-token-here',
  'your_token_here',
  'your_discogs_personal_access_token',
])

/** The usable token, or null when it's absent, blank, or an obvious placeholder. */
export function realDiscogsToken(): string | null {
  const token = (process.env.DISCOGS_TOKEN ?? '').trim()
  if (!token || PLACEHOLDERS.has(token.toLowerCase())) return null
  return token
}

export const DISCOGS_TOKEN_NOTICE =
  'These tests need a real Discogs API token and were SKIPPED.\n' +
  '  Get one (free): https://www.discogs.com/settings/developers\n' +
  '  Then add it to your .env:  DISCOGS_TOKEN="your-token-here"\n' +
  '  See .env.example. Everything else in the suite runs without a token.'

/** Prints the notice once, so a skipped run explains itself instead of looking passing-but-thin. */
export function warnDiscogsTokenMissing(what: string): void {
  console.warn(`\n⚠️  ${what}\n  ${DISCOGS_TOKEN_NOTICE}\n`)
}
