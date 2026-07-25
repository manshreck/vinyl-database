import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'
import { seedPressing } from './support/db'

// Journey: a user corrects a detail on a record they already own, and sees the change
// reflected back in their collection.
test.describe('Edit a record', () => {
  test('updating a pressing field is reflected on the collection list', async ({ page }) => {
    const email = uniqueTestEmail('edit-record')
    await registerNewUser(page, email, TEST_PASSWORD)
    const { pressingId } = await seedPressing(email, {
      title: 'Moondance',
      artistName: 'Van Morrison',
      year: 1970,
    })

    await page.goto(`/pressings/${pressingId}/edit`)
    await page.locator('input[name="label"]').fill('Warner Bros.')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await page.waitForURL('/pressings')
    const row = page.locator('tr', { hasText: 'Moondance' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Warner Bros.')
  })
})
