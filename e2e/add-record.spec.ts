import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user manually logs a record they own, from a blank "Add a record" form
// through to seeing it in their collection.
test.describe('Add a record', () => {
  test('creating a new release and pressing by hand shows it in the collection', async ({ page }) => {
    const email = uniqueTestEmail('add-record')
    await registerNewUser(page, email, TEST_PASSWORD)

    await page.goto('/pressings/new')

    await page.locator('input[name="newReleaseTitle"]').fill('Blue Train')
    await page.locator('input[name="newReleaseYear"]').fill('1957')
    await page.getByPlaceholder('Search or enter artist name…').fill('John Coltrane')
    await page.locator('select[name="formatId"]').selectOption({ label: 'LP' })
    await page.locator('select[name="recordCondition"]').selectOption({ label: 'VG — Very Good' })

    await page.getByRole('button', { name: 'Save pressing' }).click()

    await page.waitForURL('/pressings')
    const row = page.locator('tr', { hasText: 'Blue Train' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('John Coltrane')
  })
})
