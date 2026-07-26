import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD, registerNewUser } from './support/testUser'

// Journey: a user changes their password on /account, then confirms the old password
// no longer works and the new one does.
test.describe('Change password', () => {
  test('changing the password lets the user log in with the new one and not the old one', async ({ page }) => {
    const email = uniqueTestEmail('change-password')
    const newPassword = 'a-brand-new-password-123'
    await registerNewUser(page, email, TEST_PASSWORD)

    await page.goto('/account')
    await page.locator('input[name="currentPassword"]').fill(TEST_PASSWORD)
    await page.locator('input[name="newPassword"]').fill(newPassword)
    await page.locator('input[name="confirmNewPassword"]').fill(newPassword)
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page.getByText('Password changed.')).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL('/login')

    // The old password no longer works.
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Invalid email or password.')).toBeVisible()

    // The new password does.
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(newPassword)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL('/')
    await expect(page.getByRole('heading', { name: `Welcome back, ${email}` })).toBeVisible()
  })
})
