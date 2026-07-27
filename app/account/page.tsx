import { requireSession } from '@/lib/session'
import FullNameForm from './FullNameForm'
import ChangePasswordForm from './ChangePasswordForm'
import DiscogsTokenForm from './DiscogsTokenForm'
import DeleteAccountForm from './DeleteAccountForm'

export default async function AccountPage() {
  const session = await requireSession()

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
          <DiscogsTokenForm token={session.discogsToken} />
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
