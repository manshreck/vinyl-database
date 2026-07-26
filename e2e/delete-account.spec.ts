import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user deletes their own account from /account, gets logged out, and their
// old credentials no longer work — the account, and its tenant database, are really gone.
test.describe('Delete account', () => {
  test('deleting the account logs the user out and the old credentials no longer work', async ({ page }) => {
    const email = uniqueTestEmail('delete-account')
    await registerNewUser(page, email, TEST_PASSWORD)

    await page.goto('/account')
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Delete account' }).click()
    await page.getByRole('button', { name: 'Click again to permanently delete your account' }).click()

    await page.waitForURL('/login')

    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByText('Invalid email or password.')).toBeVisible()
  })
})
