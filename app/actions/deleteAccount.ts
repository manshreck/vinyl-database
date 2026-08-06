'use server'

import { deleteUser, findUserByEmail } from '@/lib/controlDb'
import { verifyPassword } from '@/lib/password'
import { dropTenantSchema } from '@/lib/provisionTenant'
import { clearSessionCookie, requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

/**
 * Drops the tenant database before deleting the control-db row (which cascades that
 * user's sessions), not the other way around: if dropTenantSchema fails, the
 * account and session are left fully intact and the error is just reported back —
 * a clean failure, rather than a user row surviving with no data behind it.
 */
export async function deleteAccount(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()
  const password = formData.get('password') as string

  const user = await findUserByEmail(session.email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Incorrect password.' }
  }

  await dropTenantSchema(user.databaseName)
  await deleteUser(user.id)
  await clearSessionCookie()

  redirect('/login')
}
