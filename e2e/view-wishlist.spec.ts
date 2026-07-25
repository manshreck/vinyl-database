import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'
import { seedWishlistItem } from './support/db'

// Journey: a user opens their wishlist and sees what's on it, with a way to move an
// item into their collection once they've bought it.
test.describe('View wishlist', () => {
  test('a wishlist item is listed with its details and an Add to Collection link', async ({ page }) => {
    const email = uniqueTestEmail('view-wishlist')
    await registerNewUser(page, email, TEST_PASSWORD)
    await seedWishlistItem(email, { title: 'Rumours', artistName: 'Fleetwood Mac', year: 1977 })

    await page.goto('/wishlist')

    await expect(page.getByRole('heading', { name: 'Wishlist' })).toBeVisible()
    const row = page.locator('tr', { hasText: 'Rumours' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Fleetwood Mac')
    await expect(row.getByRole('link', { name: 'Add to Collection' })).toBeVisible()
  })

  test('caps the wishlist at 25 entries per page, with a link to further pages', async ({ page }) => {
    const email = uniqueTestEmail('wishlist-pagination')
    await registerNewUser(page, email, TEST_PASSWORD)

    for (let i = 1; i <= 26; i++) {
      const n = String(i).padStart(2, '0')
      await seedWishlistItem(email, { title: `Pagination Test ${n}`, artistName: `Pagination Artist ${n}` })
    }

    await page.goto('/wishlist')

    // Sorted by artist, so items 01–25 land on page 1 and 26 spills to page 2.
    await expect(page.locator('tbody tr')).toHaveCount(25)
    await expect(page.locator('tr', { hasText: 'Pagination Artist 01' })).toBeVisible()
    await expect(page.locator('tr', { hasText: 'Pagination Artist 26' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Next' }).click()
    await page.waitForURL(/[?&]page=2/)

    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tr', { hasText: 'Pagination Artist 26' })).toBeVisible()
  })
})
