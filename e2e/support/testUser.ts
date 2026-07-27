import { randomBytes } from 'crypto'
import type { Page } from '@playwright/test'

/**
 * Every e2e-created account uses this email domain, so e2e/global-teardown.ts can
 * find and remove them (control-db row + tenant database) after the run without
 * having to track individual accounts across spec files.
 */
export const TEST_EMAIL_DOMAIN = '@vinyl-test.local'

export const TEST_PASSWORD = 'Test-Password-123!'

/** A fresh, unique email for one test's throwaway account. */
export function uniqueTestEmail(label: string): string {
  return `e2e-${label}-${randomBytes(4).toString('hex')}${TEST_EMAIL_DOMAIN}`
}

/**
 * Registers a brand-new account through the real /register form (the user's actual
 * entry point — see swe-e2e-testing), skips the post-registration setup wizard (real
 * name / Discogs token — both optional, see e2e/complete-setup.spec.ts for that
 * journey), and waits for the resulting session to land on the home page. Each
 * journey that needs to be logged in calls this with its own unique email, trading a
 * little registration overhead per test for full isolation: no shared account, no
 * cross-spec ordering to reason about.
 */
export async function registerNewUser(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto('/register')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('input[name="confirmPassword"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/setup')
  await page.getByText('Skip for now').click()
  await page.waitForURL('/')
}
