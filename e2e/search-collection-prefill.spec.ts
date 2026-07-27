import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user searches their own collection for a release they already own,
// picks a result from /releases, and lands back on "Add Record" with that release
// preselected — ready to log a second pressing of it without re-entering release
// details.
test.describe('Search collection and prepopulate Add Record', () => {
  test('picking a collection search result preselects the release on the new-pressing form', async ({ page }) => {
    const email = uniqueTestEmail('collection-search-prefill')
    await registerNewUser(page, email, TEST_PASSWORD)

    // Seed a release to search for.
    await page.goto('/pressings/new')
    await page.getByPlaceholder('Search by title…').fill('Blue Train')
    await page.getByText('+ Add Record Manually').click()
    await page.locator('input[name="newReleaseYear"]').fill('1957')
    await page.getByPlaceholder('Search or enter artist name…').fill('John Coltrane')
    await page.locator('select[name="formatId"]').selectOption({ label: 'LP' })
    await page.locator('select[name="recordCondition"]').selectOption({ label: 'VG — Very Good' })
    await page.getByRole('button', { name: 'Save pressing' }).click()
    await page.waitForURL('/pressings')

    // Search the collection for it from a fresh Add Record page.
    await page.goto('/pressings/new')
    await page.getByPlaceholder('Search by title…').fill('Blue Train')
    await page.getByRole('button', { name: 'Search' }).nth(1).click()
    await page.waitForURL(/\/releases\?q=/)
    await expect(page.getByText(/Showing \d+ results?/)).toBeVisible()

    await page.locator('a[href^="/pressings/new?releaseId="]').first().click()
    await page.waitForURL(/\/pressings\/new\?releaseId=/)

    await expect(page.getByText('Blue Train')).toBeVisible()
    await expect(page.getByText('John Coltrane')).toBeVisible()
    await expect(page.getByText('Pressing details')).toBeVisible()
  })
})
