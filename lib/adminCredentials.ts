// ADMIN_USERNAME is hardcoded — there's only ever one admin account, so a second
// environment variable for it wouldn't buy anything. ADMIN_PASSWORD is read from the
// environment and defaults to blank when unset, matching this app's original
// hardcoded-blank behavior for local development; app/admin/page.tsx surfaces a
// warning after login for as long as it remains blank. Set a real ADMIN_PASSWORD in
// .env before deploying anywhere beyond localhost.
export const ADMIN_USERNAME = 'admin'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''
