import {
  createUser,
  deleteUser,
  findUserByEmail,
  updateDiscogsToken as updateDiscogsTokenInDb,
  updateFullName as updateFullNameInDb,
  updatePasswordHash,
  type ControlUser,
} from '@/lib/controlDb'
import { hashPassword, verifyPassword } from '@/lib/password'
import { createTenantSchema, dropTenantSchema, generateSchemaName } from '@/lib/provisionTenant'

/**
 * Control-plane operations: accounts, credentials, provisioning.
 *
 * These return outcomes rather than setting cookies or redirecting. Establishing a
 * session is the transport's job — a cookie on the web, a returned bearer token over
 * HTTP — and it is the only part of signing in that differs between them.
 */

export const MIN_PASSWORD_LENGTH = 8

export type RegisterInput = {
  email: string
  password: string
  confirmPassword: string
}

export type RegisterResult =
  | { status: 'created'; userId: number }
  | { status: 'invalid'; message: string }

function isSchemaNameCollision(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { constraint?: string }).constraint === 'users_database_name_key'
  )
}

/**
 * Creates an account and provisions its tenant schema.
 *
 * On provisioning failure the user row is removed again, so a failed signup leaves
 * nothing behind rather than an account with no collection behind it.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase()
  const { password, confirmPassword } = input

  if (!email || !password) return { status: 'invalid', message: 'Email and password are required.' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'invalid',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  if (password !== confirmPassword) {
    return { status: 'invalid', message: 'Passwords do not match.' }
  }

  if (await findUserByEmail(email)) {
    return { status: 'invalid', message: 'An account with that email already exists.' }
  }

  const passwordHash = hashPassword(password)

  let user: ControlUser | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      user = await createUser(email, passwordHash, generateSchemaName())
      break
    } catch (err) {
      if (isSchemaNameCollision(err) && attempt < 2) continue
      throw err
    }
  }
  if (!user) return { status: 'invalid', message: 'Could not create account. Please try again.' }

  try {
    await createTenantSchema(user.databaseName)
  } catch (err) {
    await deleteUser(user.id)
    console.error('Tenant provisioning failed:', err)
    return {
      status: 'invalid',
      message: 'Could not set up your collection database. Please try again.',
    }
  }

  return { status: 'created', userId: user.id }
}

export type AuthenticateResult =
  | { status: 'ok'; userId: number }
  | { status: 'invalid_credentials' }

/** Verifies a password. Establishing the session is left to the caller. */
export async function authenticate(
  email: string,
  password: string
): Promise<AuthenticateResult> {
  const user = await findUserByEmail(email.trim().toLowerCase())
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: 'invalid_credentials' }
  }
  return { status: 'ok', userId: user.id }
}

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export type ChangePasswordResult = { status: 'ok' } | { status: 'invalid'; message: string }

export async function changePassword(
  email: string,
  input: ChangePasswordInput
): Promise<ChangePasswordResult> {
  const { currentPassword, newPassword, confirmNewPassword } = input

  if (!currentPassword || !newPassword) {
    return { status: 'invalid', message: 'All fields are required.' }
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'invalid',
      message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  if (newPassword !== confirmNewPassword) {
    return { status: 'invalid', message: 'New passwords do not match.' }
  }

  const user = await findUserByEmail(email)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return { status: 'invalid', message: 'Current password is incorrect.' }
  }

  await updatePasswordHash(user.id, hashPassword(newPassword))
  return { status: 'ok' }
}

/** Blank clears the stored token, falling the account back to the shared env one. */
export async function setDiscogsToken(userId: number, token: string): Promise<void> {
  await updateDiscogsTokenInDb(userId, token.trim() || null)
}

export async function setFullName(userId: number, fullName: string): Promise<void> {
  await updateFullNameInDb(userId, fullName.trim() || null)
}

export async function completeSetup(
  userId: number,
  fullName: string,
  discogsToken: string
): Promise<void> {
  await Promise.all([setFullName(userId, fullName), setDiscogsToken(userId, discogsToken)])
}

export type DeleteAccountResult = { status: 'deleted' } | { status: 'invalid_password' }

/**
 * Drops the tenant schema before deleting the control-plane row (which cascades that
 * user's sessions), not the other way around: if dropTenantSchema fails, the account
 * and session are left fully intact and the error is just reported back — a clean
 * failure, rather than a user row surviving with no data behind it.
 */
export async function deleteAccount(
  email: string,
  password: string
): Promise<DeleteAccountResult> {
  const user = await findUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: 'invalid_password' }
  }

  await dropTenantSchema(user.databaseName)
  await deleteUser(user.id)
  return { status: 'deleted' }
}
