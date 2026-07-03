'use server'

import { createUser, deleteUser, findUserByEmail, type ControlUser } from '@/lib/controlDb'
import { hashPassword } from '@/lib/password'
import { createTenantDatabase, generateDatabaseName } from '@/lib/provisionTenant'
import { createSessionCookie } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

function isDatabaseNameCollision(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { constraint?: string }).constraint === 'users_database_name_key'
  )
}

export async function registerUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!email || !password) return { error: 'Email and password are required.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirmPassword) return { error: 'Passwords do not match.' }

  if (await findUserByEmail(email)) {
    return { error: 'An account with that email already exists.' }
  }

  const passwordHash = hashPassword(password)

  let user: ControlUser | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      user = await createUser(email, passwordHash, generateDatabaseName())
      break
    } catch (err) {
      if (isDatabaseNameCollision(err) && attempt < 2) continue
      throw err
    }
  }
  if (!user) return { error: 'Could not create account. Please try again.' }

  try {
    await createTenantDatabase(user.databaseName)
  } catch (err) {
    await deleteUser(user.id)
    console.error('Tenant provisioning failed:', err)
    return { error: 'Could not set up your collection database. Please try again.' }
  }

  await createSessionCookie(user.id)
  redirect('/pressings')
}
