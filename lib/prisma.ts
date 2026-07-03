import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { tenantConnectionString } from '@/lib/dbUrls'

const IDLE_EVICTION_MS = 30 * 60 * 1000 // 30 minutes
const TENANT_POOL_MAX = 5

type CachedClient = { client: PrismaClient; timer: ReturnType<typeof setTimeout> }

const globalForPrisma = globalThis as unknown as { tenantClients?: Map<string, CachedClient> }

const tenantClients = globalForPrisma.tenantClients ?? new Map<string, CachedClient>()
if (process.env.NODE_ENV !== 'production') globalForPrisma.tenantClients = tenantClients

function createTenantClient(databaseName: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: tenantConnectionString(databaseName),
    max: TENANT_POOL_MAX,
  })
  return new PrismaClient({ adapter })
}

function scheduleEviction(databaseName: string) {
  return setTimeout(() => {
    const cached = tenantClients.get(databaseName)
    if (!cached) return
    tenantClients.delete(databaseName)
    cached.client.$disconnect()
  }, IDLE_EVICTION_MS)
}

/**
 * Returns a (cached) PrismaClient connected to the given tenant's database.
 * Pure cache-and-construct — callers are responsible for authenticating the
 * request and resolving `databaseName` via lib/session.ts first.
 */
export async function getTenantPrisma(databaseName: string): Promise<PrismaClient> {
  const cached = tenantClients.get(databaseName)
  if (cached) {
    clearTimeout(cached.timer)
    cached.timer = scheduleEviction(databaseName)
    return cached.client
  }

  const client = createTenantClient(databaseName)
  tenantClients.set(databaseName, { client, timer: scheduleEviction(databaseName) })
  return client
}
