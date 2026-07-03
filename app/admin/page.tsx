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
            testing, but production systems should never have a blank admin password — set{' '}
            <code className="font-mono">ADMIN_PASSWORD</code> in <code className="font-mono">lib/adminCredentials.ts</code>{' '}
            before deploying anywhere reachable by others.
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
      </div>
    </div>
  )
}
