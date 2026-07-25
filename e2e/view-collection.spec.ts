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

  test('caps the collection at 25 entries per page, with a link to further pages', async ({ page }) => {
    const email = uniqueTestEmail('collection-pagination')
    await registerNewUser(page, email, TEST_PASSWORD)

    for (let i = 1; i <= 26; i++) {
      const n = String(i).padStart(2, '0')
      await seedPressing(email, { title: `Pagination Test ${n}`, artistName: `Pagination Artist ${n}` })
    }

    await page.goto('/pressings')

    // Default sort is by artist, so items 01–25 land on page 1 and 26 spills to page 2.
    await expect(page.locator('tbody tr')).toHaveCount(25)
    await expect(page.locator('tr', { hasText: 'Pagination Artist 01' })).toBeVisible()
    await expect(page.locator('tr', { hasText: 'Pagination Artist 26' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Next' }).click()
    await page.waitForURL(/[?&]page=2/)

    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tr', { hasText: 'Pagination Artist 26' })).toBeVisible()
  })
})
