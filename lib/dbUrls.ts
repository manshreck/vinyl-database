/**
 * DATABASE_URL is a connection template (host/port/credentials) shared by every
 * tenant database and the Postgres maintenance database — only the path (database
 * name) differs per connection.
 */
function withDatabaseName(databaseName: string): string {
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

/** Connection string for the Postgres maintenance database (CREATE DATABASE / DROP DATABASE). */
export function adminConnectionString(): string {
  return withDatabaseName('postgres')
}

/** Connection string for a specific tenant's database. */
export function tenantConnectionString(databaseName: string): string {
  return withDatabaseName(databaseName)
}
