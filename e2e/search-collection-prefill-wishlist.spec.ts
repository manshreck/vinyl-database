import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user searches their own collection for a release they already own,
// picks a result from /releases (tagged for the wishlist), and lands back on
// "Add to wishlist" with that release preselected.
test.describe('Search collection and prepopulate Add to wishlist', () => {
  test('picking a collection search result preselects the release on the new-wishlist-item form', async ({ page }) => {
    const email = uniqueTestEmail('wishlist-search-prefill')
    await registerNewUser(page, email, TEST_PASSWORD)

    // Seed a release to search for (added to the collection, not the wishlist).
    await page.goto('/pressings/new')
    await page.locator('input[name="newReleaseTitle"]').fill('Blue Train')
    await page.locator('input[name="newReleaseYear"]').fill('1957')
    await page.getByPlaceholder('Search or enter artist name…').fill('John Coltrane')
    await page.locator('select[name="formatId"]').selectOption({ label: 'LP' })
    await page.locator('select[name="recordCondition"]').selectOption({ label: 'VG — Very Good' })
    await page.getByRole('button', { name: 'Save pressing' }).click()
    await page.waitForURL('/pressings')

    // Search the collection for it from the wishlist search launcher.
    await page.goto('/wishlist/search')
    await page.getByPlaceholder('Search by title…').fill('Blue Train')
    await page.getByRole('button', { name: 'Search' }).nth(1).click()
    await page.waitForURL(/\/releases\?.*for=wishlist/)
    await expect(page.getByText(/Showing \d+ results?/)).toBeVisible()

    await page.locator('a[href^="/wishlist/new?releaseId="]').first().click()
    await page.waitForURL(/\/wishlist\/new\?releaseId=/)

    await expect(page.getByText('Blue Train')).toBeVisible()
    await expect(page.getByText('John Coltrane')).toBeVisible()
    await expect(page.getByText('Pressing details')).toBeVisible()
  })
})
