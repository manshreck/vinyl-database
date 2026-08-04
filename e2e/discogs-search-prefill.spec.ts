import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'
import { realDiscogsToken, DISCOGS_TOKEN_NOTICE } from '../test-support/discogsToken'

// Journey: a user searches Discogs for a release, picks a result, and lands on "Add a
// record" with the title/year/artist/cover image already filled in. Hits the real
// Discogs API (see TESTING.md §2.5) — the slowest and only network-dependent
// journey in this suite, kept to one test.
test.describe('Search Discogs and prepopulate Add a record', () => {
  // Skipped rather than failed without a token, so a fresh clone runs the suite green.
  test.skip(realDiscogsToken() === null, DISCOGS_TOKEN_NOTICE)

  test('picking a Discogs result prefills the new-pressing form', async ({ page }) => {
    const email = uniqueTestEmail('discogs-prefill')
    await registerNewUser(page, email, TEST_PASSWORD)

    await page.goto('/discogs?q=' + encodeURIComponent('Kind of Blue Miles Davis'))
    await expect(page.getByText(/Showing \d+ results?/)).toBeVisible()

    await page.locator('a[href^="/discogs/"]').first().click()
    await expect(page.getByRole('link', { name: 'Add to Collection' })).toBeVisible()

    await page.getByRole('link', { name: 'Add to Collection' }).click()
    await page.waitForURL(/\/pressings\/new\?discogsId=/)

    await expect(page.locator('input[name="newReleaseTitle"]')).toHaveValue(/Kind Of Blue/i)
    await expect(page.locator('input[name="newReleaseYear"]')).not.toHaveValue('')
    await expect(page.getByPlaceholder('Search or enter artist name…')).toHaveValue(/Miles Davis/i)
  })
})
