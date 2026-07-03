import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const formats = [
    { name: '7"', description: '7-inch single' },
    { name: '10"', description: '10-inch record' },
    { name: '12"', description: '12-inch single or EP' },
    { name: 'LP', description: 'Long play, 12-inch album' },
    { name: '2xLP', description: 'Double album' },
    { name: '3xLP', description: 'Triple album' },
    { name: '4xLP', description: 'Quadruple album' },
    { name: 'Box Set', description: 'Multi-record box set' },
    { name: 'Cassette', description: 'Cassette tape' },
    { name: 'CD', description: 'Compact disc' },
  ]

  for (const format of formats) {
    await prisma.format.upsert({
      where: { name: format.name },
      update: {},
      create: format,
    })
  }

  console.log(`Seeded ${formats.length} formats.`)

  const genres = [
    'Ambient',
    'Blues',
    'Classical',
    'Country',
    'Electronic',
    'Folk',
    'Funk',
    'Hip-Hop',
    'Jazz',
    'Latin',
    'Metal',
    'Pop',
    'Punk',
    'R&B / Soul',
    'Reggae',
    'Rock',
    'Spoken Word',
    'World',
  ]

  for (const name of genres) {
    await prisma.genre.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  console.log(`Seeded ${genres.length} genres.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
