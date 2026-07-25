import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user logs a record they don't own yet but want, from a blank
// "Add to wishlist" form through to seeing it on their wishlist.
test.describe('Add to wishlist', () => {
  test('creating a new release and wishlist item by hand shows it on the wishlist', async ({ page }) => {
    const email = uniqueTestEmail('add-wishlist')
    await registerNewUser(page, email, TEST_PASSWORD)

    await page.goto('/wishlist/new')

    await page.getByPlaceholder('Search by title…').fill('Blonde on Blonde')
    await page.getByText(/No results/).click()

    await page.locator('input[name="newReleaseYear"]').fill('1966')
    await page.getByPlaceholder('Search or enter artist name…').fill('Bob Dylan')
    await page.locator('select[name="formatId"]').selectOption({ label: 'LP' })

    await page.getByRole('button', { name: 'Save to wishlist' }).click()

    await page.waitForURL('/wishlist')
    const row = page.locator('tr', { hasText: 'Blonde on Blonde' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Bob Dylan')
  })
})
