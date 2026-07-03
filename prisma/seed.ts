import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { FORMATS, GENRES } from './referenceData'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  for (const format of FORMATS) {
    await prisma.format.upsert({
      where: { name: format.name },
      update: {},
      create: format,
    })
  }

  console.log(`Seeded ${FORMATS.length} formats.`)

  for (const name of GENRES) {
    await prisma.genre.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  console.log(`Seeded ${GENRES.length} genres.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
