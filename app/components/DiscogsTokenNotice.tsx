import Link from 'next/link'

export default function DiscogsTokenNotice() {
  return (
    <p className="mb-2 text-xs text-amber-700 dark:text-amber-500">
      No personal Discogs token is set — using this app&rsquo;s shared, rate-limited token. Add your own in{' '}
      <Link href="/account" className="underline hover:text-amber-900 dark:hover:text-amber-400">
        Account
      </Link>
      .
    </p>
  )
}
