import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { tenantConnectionString } from '@/lib/dbUrls'
import { findUserByEmail } from '@/lib/controlDb'

/**
 * Fixture helpers that seed data directly through Prisma rather than the UI, for
 * journeys (view collection, view wishlist, edit a record) whose point is verifying
 * the *view* or *update* — not re-driving the add flow those journeys deliberately
 * don't duplicate. Each call opens and closes its own connection (rather than reusing
 * the app's cached getTenantPrisma) so the Playwright process never accumulates the
 * long-lived idle-eviction timers lib/prisma.ts schedules for the dev-server process.
 */
async function withTenantPrisma<T>(
  email: string,
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const user = await findUserByEmail(email)
  if (!user) throw new Error(`No control-db user found for ${email} — register it first`)

  const adapter = new PrismaPg({ connectionString: tenantConnectionString(user.databaseName) })
  const prisma = new PrismaClient({ adapter })
  try {
    return await fn(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

type SeedReleaseInput = {
  title: string
  artistName: string
  year?: number
  formatName?: string
}

/** Creates a release + pressing directly in `email`'s tenant database. Returns the new ids. */
export async function seedPressing(
  email: string,
  { title, artistName, year = 1970, formatName = 'LP' }: SeedReleaseInput
): Promise<{ pressingId: number; releaseId: number }> {
  return withTenantPrisma(email, async (prisma) => {
    const format = await prisma.format.findFirstOrThrow({ where: { name: formatName } })
    const artist = await prisma.artist.create({ data: { name: artistName, sortName: artistName } })
    const release = await prisma.release.create({
      data: {
        title,
        originalReleaseYear: year,
        artists: { create: [{ artistId: artist.artistId, artistOrder: 1 }] },
      },
    })
    const pressing = await prisma.pressing.create({
      data: {
        releaseId: release.releaseId,
        formatId: format.formatId,
        recordCondition: 'VG_PLUS',
        discCount: 1,
      },
    })
    return { pressingId: pressing.pressingId, releaseId: release.releaseId }
  })
}

/** Creates a release + wishlist item directly in `email`'s tenant database. Returns the new ids. */
export async function seedWishlistItem(
  email: string,
  { title, artistName, year = 1970, formatName = 'LP' }: SeedReleaseInput
): Promise<{ wishlistItemId: number; releaseId: number }> {
  return withTenantPrisma(email, async (prisma) => {
    const format = await prisma.format.findFirstOrThrow({ where: { name: formatName } })
    const artist = await prisma.artist.create({ data: { name: artistName, sortName: artistName } })
    const release = await prisma.release.create({
      data: {
        title,
        originalReleaseYear: year,
        artists: { create: [{ artistId: artist.artistId, artistOrder: 1 }] },
      },
    })
    const item = await prisma.wishlistItem.create({
      data: { releaseId: release.releaseId, formatId: format.formatId, discCount: 1 },
    })
    return { wishlistItemId: item.wishlistItemId, releaseId: release.releaseId }
  })
}
