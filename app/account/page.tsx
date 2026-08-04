import { requireSession } from '@/lib/session'
import { verifyDiscogsToken } from '@/lib/discogs'
import { getTenantPrisma } from '@/lib/prisma'
import FullNameForm from './FullNameForm'
import ChangePasswordForm from './ChangePasswordForm'
import DiscogsTokenForm from './DiscogsTokenForm'
import DeleteAccountForm from './DeleteAccountForm'

export default async function AccountPage() {
  const session = await requireSession()

  // Checked live rather than assumed: a token can be revoked or regenerated on
  // Discogs' side at any time, and this page is where someone comes to find out.
  const tokenStatus = await verifyDiscogsToken(session.discogsToken)

  // Say what the download will contain, so an export can be recognised as complete —
  // or as empty, which is worth knowing before it is filed away as a backup.
  const prisma = await getTenantPrisma(session.databaseName)
  const [pressingCount, wishlistCount] = await Promise.all([
    prisma.pressing.count(),
    prisma.wishlistItem.count(),
  ])
  const collectionIsEmpty = pressingCount === 0 && wishlistCount === 0

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Account</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{session.email}</p>
        </div>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Full Name</h2>
          <FullNameForm fullName={session.fullName} />
        </section>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Change password</h2>
          <ChangePasswordForm />
        </section>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Discogs token</h2>
          <DiscogsTokenForm token={session.discogsToken} tokenStatus={tokenStatus} />
        </section>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Export your data</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your data, in two forms. Both are plain readable text, not proprietary formats.
          </p>

          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              SQL — a complete backup
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Everything: every record, pressing and wishlist entry, plus the schema, so it
              restores into any PostgreSQL database without this app.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-950 px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">
            <code>{'createdb my_vinyl_restore\npsql -d my_vinyl_restore -f vinyl-collection-….sql'}</code>
          </pre>

          <div className="space-y-1 pt-2">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              CSV — a spreadsheet of your collection
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              One row per pressing, for opening in a spreadsheet or importing elsewhere. Covers
              the collection only, not the wishlist, and being a flat table it is not a backup —
              use the SQL file for that.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Note: spreadsheet apps tend to read catalog numbers like{' '}
              <span className="font-mono">075678584206</span> as numbers and drop the leading
              zero. Import that column as text to keep it intact.
            </p>
          </div>
          {collectionIsEmpty ? (
            <p className="rounded-lg bg-amber-50 dark:bg-amber-950 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
              Your collection is empty. An export right now would rebuild the structure but
              contain no records — worth knowing before you keep it as a backup.
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              This export will contain{' '}
              <strong className="font-semibold text-zinc-900 dark:text-zinc-50">
                {pressingCount} {pressingCount === 1 ? 'pressing' : 'pressings'}
              </strong>{' '}
              and{' '}
              <strong className="font-semibold text-zinc-900 dark:text-zinc-50">
                {wishlistCount} {wishlistCount === 1 ? 'wishlist entry' : 'wishlist entries'}
              </strong>
              .
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/account/export"
              className="inline-block rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Download collection (.sql)
            </a>
            <a
              href="/account/export/csv"
              className="inline-block rounded-full border border-zinc-300 dark:border-zinc-600 px-6 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Download collection (.csv)
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-red-700 dark:text-red-400">Delete account</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This permanently deletes your account and your entire collection. This cannot be undone.
          </p>
          <DeleteAccountForm />
        </section>
      </div>
    </div>
  )
}
