import { test, expect } from '@playwright/test'
import { uniqueTestEmail, TEST_PASSWORD } from './support/testUser'

// Journey: a new visitor creates an account, then fills in the optional
// post-registration setup wizard (real name, Discogs token) instead of skipping it.
test.describe('Complete the post-registration setup wizard', () => {
  test('filling in a real name shows it on the home page instead of the email', async ({ page }) => {
    const email = uniqueTestEmail('complete-setup')

    await page.goto('/register')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.locator('input[name="confirmPassword"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.waitForURL('/setup')
    await page.locator('input[name="fullName"]').fill('Miles Davis')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.waitForURL('/')
    await expect(page.getByRole('heading', { name: 'Welcome back, Miles Davis' })).toBeVisible()
  })

  test('saving a Discogs token on setup carries through to Account', async ({ page }) => {
    const email = uniqueTestEmail('complete-setup-token')

    await page.goto('/register')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.locator('input[name="confirmPassword"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.waitForURL('/setup')
    await page.locator('input[name="discogsToken"]').fill('setup-wizard-token')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL('/')

    await page.goto('/account')
    await expect(page.getByText('A discogs token is set for your account.')).toBeVisible()
  })
})
