import { requireSession } from '@/lib/session'
import Link from 'next/link'

const cards = [
  {
    href: '/pressings',
    title: 'View Collection',
    description: 'Browse the records you already own.',
  },
  {
    href: '/pressings/new',
    title: 'Add Record',
    description: 'Log a pressing you own into your collection.',
  },
  {
    href: '/wishlist/new',
    title: 'Add to Wishlist',
    description: 'Track a pressing you’re hoping to pick up.',
  },
]

export default async function Home() {
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome back{session.email ? `, ${session.email}` : ''}
        </h1>
        <p className="mb-8 text-zinc-500 dark:text-zinc-400">What would you like to do?</p>

        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
            >
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                {card.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
