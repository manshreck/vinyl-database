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
})
