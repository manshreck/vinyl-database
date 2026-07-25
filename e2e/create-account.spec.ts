import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD } from './support/testUser'

// Journey: a new visitor creates an account and lands in a working, empty collection.
test.describe('Create a new account', () => {
  test('registering provisions a session and a usable collection', async ({ page }) => {
    const email = uniqueTestEmail('create-account')

    await page.goto('/register')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.locator('input[name="confirmPassword"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.waitForURL('/')
    await expect(page.getByRole('heading', { name: `Welcome back, ${email}` })).toBeVisible()

    // The freshly provisioned tenant database is real and immediately usable.
    await page.locator('a[href="/pressings"]').click()
    await page.waitForURL('/pressings')
    await expect(page.getByRole('heading', { name: 'Record Collection' })).toBeVisible()
    await expect(page.getByText('No records match the current filters.')).toBeVisible()
  })
})
