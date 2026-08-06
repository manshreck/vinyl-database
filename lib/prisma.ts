import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { schemaConnectionConfig } from '@/lib/dbUrls'

const IDLE_EVICTION_MS = 30 * 60 * 1000 // 30 minutes
const TENANT_POOL_MAX = 5

type CachedClient = { client: PrismaClient; timer: ReturnType<typeof setTimeout> }

const globalForPrisma = globalThis as unknown as { tenantClients?: Map<string, CachedClient> }

const tenantClients = globalForPrisma.tenantClients ?? new Map<string, CachedClient>()
if (process.env.NODE_ENV !== 'production') globalForPrisma.tenantClients = tenantClients

/**
 * Binds a client to one tenant's schema, two ways, because each covers what the
 * other misses:
 *
 * - the adapter's `schema` option qualifies Prisma's *generated* SQL;
 * - `search_path` on the connection resolves everything else — `$queryRaw`
 *   (app/search/page.tsx is built on it) and any plain `pg` query.
 *
 * With only the first, unqualified raw SQL resolves against `public`: it returns
 * rows rather than erroring, so the failure mode is reading another tenant's data
 * silently. Neither mechanism alone is sufficient; together each is harmless
 * redundancy for the other's half.
 */
function createTenantClient(schema: string): PrismaClient {
  const adapter = new PrismaPg(
    { ...schemaConnectionConfig(schema), max: TENANT_POOL_MAX },
    { schema }
  )
  return new PrismaClient({ adapter })
}

function scheduleEviction(schema: string) {
  return setTimeout(() => {
    const cached = tenantClients.get(schema)
    if (!cached) return
    tenantClients.delete(schema)
    cached.client.$disconnect()
  }, IDLE_EVICTION_MS)
}

/**
 * Returns a (cached) PrismaClient scoped to the given tenant's schema.
 * Pure cache-and-construct — callers are responsible for authenticating the
 * request and resolving the schema name via lib/session.ts first.
 *
 * Request handling only. The cache and its eviction timer assume a process that stays
 * up; code running outside a request (exports, scripts, one-shot jobs) should open a
 * short-lived `pg` Client and close it — see lib/exportTenant.ts. Called from such
 * code this appears to work and then keeps Node alive, because the pending timer and
 * open pool are enough to stop the event loop draining.
 */
export async function getTenantPrisma(schema: string): Promise<PrismaClient> {
  const cached = tenantClients.get(schema)
  if (cached) {
    clearTimeout(cached.timer)
    cached.timer = scheduleEviction(schema)
    return cached.client
  }

  const client = createTenantClient(schema)
  tenantClients.set(schema, { client, timer: scheduleEviction(schema) })
  return client
}
