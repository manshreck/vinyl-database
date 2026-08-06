import { requireAdminSession } from '@/lib/adminSession'
import { listUsers } from '@/lib/controlDb'
import { countPressings } from '@/lib/adminStats'
import { logoutAdmin } from '@/app/actions/logoutAdmin'
import { ADMIN_PASSWORD } from '@/lib/adminCredentials'

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function AdminPage() {
  await requireAdminSession()

  const users = await listUsers()
  const pressingCounts = await Promise.all(users.map((u) => countPressings(u.databaseName)))

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Accounts</h1>
          <form action={logoutAdmin}>
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
            >
              Log out
            </button>
          </form>
        </div>

        {ADMIN_PASSWORD === '' && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Warning:</strong> the admin account has a blank password. This is fine for local
            testing, but production systems should never have a blank admin password — set the{' '}
            <code className="font-mono">ADMIN_PASSWORD</code> environment variable in your{' '}
            <code className="font-mono">.env</code> file before deploying anywhere reachable by others.
          </div>
        )}

        {users.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">No accounts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Records</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {users.map((user, i) => (
                  <tr
                    key={user.id}
                    className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {pressingCounts[i]}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDate(user.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="mt-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Whole-system backup
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            One SQL file rebuilding everything — every account and all{' '}
            {users.length === 1 ? 'their' : 'their'} collections — into an empty database.
            Every account also has its own export on their account page; this is the one that
            covers all of them at once, and the answer to every tenant sharing a database.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Login sessions are deliberately excluded, so everyone signs in again after a
            restore. Accounts, password hashes and Discogs tokens are included.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Store this file like a password.</strong> It contains every account&rsquo;s
            password hash and Discogs API token.
          </div>
          <pre className="overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-950 px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">
            <code>{'createdb vinyl_restored\npsql -d vinyl_restored -f vinyl-full-backup-….sql'}</code>
          </pre>
          <a
            href="/admin/backup"
            className="inline-block rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Download full backup (.sql)
          </a>
        </section>
      </div>
    </div>
  )
}
