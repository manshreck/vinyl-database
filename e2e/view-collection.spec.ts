import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'
import { seedPressing } from './support/db'

// Journey: a user with existing records opens their collection and sees them listed correctly.
test.describe('View collection', () => {
  test('a pressing in the collection is listed with its release and format details', async ({ page }) => {
    const email = uniqueTestEmail('view-collection')
    await registerNewUser(page, email, TEST_PASSWORD)
    await seedPressing(email, { title: 'Highway 61 Revisited', artistName: 'Bob Dylan', year: 1965 })

    await page.goto('/pressings')

    await expect(page.getByRole('heading', { name: 'Record Collection' })).toBeVisible()
    const row = page.locator('tr', { hasText: 'Highway 61 Revisited' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Bob Dylan')
    await expect(row).toContainText('LP')
    await expect(row).toContainText('1965')
  })
})
