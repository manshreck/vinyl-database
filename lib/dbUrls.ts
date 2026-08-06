/**
 * One database, one schema per tenant.
 *
 * DATABASE_URL is the full connection string for that single database — not, as it
 * once was, a template whose path gets swapped per tenant. Tenancy is now expressed
 * by which schema a connection resolves names in, via `search_path`.
 */

/**
 * The control plane's schema: accounts, sessions, admin sessions.
 *
 * Overridable so seam and system tests can point a freshly-loaded controlDb at a
 * scratch schema — the role `CONTROL_DATABASE_URL` played before there was only one
 * database. Read per call rather than at module load, so a test that sets it after
 * `jest.resetModules()` is honoured regardless of import order.
 */
export function controlSchema(): string {
  return process.env.CONTROL_SCHEMA ?? 'control'
}

/**
 * Names safe to interpolate into a connection's `options` or into DDL.
 *
 * This is the injection boundary. Schema names reach Postgres by string
 * interpolation — `search_path` cannot be parameterized, and neither can
 * `CREATE SCHEMA` — so every name must clear this before it is used. Deliberately
 * narrower than Postgres's own rules: lowercase, digits and underscore only, which
 * admits every name this application generates and nothing that could terminate a
 * statement or an options string.
 *
 * Callers that *create or drop* schemas apply their own, stricter check on top (see
 * provisionTenant's tenant pattern and the test-support scratch pattern); those
 * answer "may this code touch this schema", which is a different question from
 * "is this string safe to interpolate".
 */
const SAFE_SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/

export function assertSafeSchemaName(schema: string): void {
  if (!SAFE_SCHEMA_NAME.test(schema)) {
    throw new Error(`Unsafe schema name: ${schema}`)
  }
}

/** The single database every schema lives in. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL!
}

/**
 * Connection config resolving unqualified names in `schema`.
 *
 * The `search_path` matters even where a Prisma adapter is also given its own
 * `schema` option: that option only rewrites Prisma's *generated* SQL. Raw
 * `$queryRaw` and plain `pg` queries follow `search_path` alone, and without it
 * silently resolve against `public` — reading the wrong tenant rather than failing.
 */
export function schemaConnectionConfig(schema: string): { connectionString: string; options: string } {
  assertSafeSchemaName(schema)
  return {
    connectionString: databaseUrl(),
    options: `-c search_path=${schema}`,
  }
}

/** Connection config for the control plane. */
export function controlConnectionConfig(): { connectionString: string; options: string } {
  return schemaConnectionConfig(controlSchema())
}
