import { requireSession } from '@/lib/session'
import Link from 'next/link'
import { completeSetup } from '@/app/actions/completeSetup'

export default async function SetupPage() {
  await requireSession()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome to Vinyl Database
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          A couple of quick, optional things before you get started — everything here can also be done later, so feel free to just head to Home if you&rsquo;d rather skip it for now.
        </p>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">What this app does</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Vinyl Database helps you catalog the records you own, track the specific pressings you have — pressing year, country, label, catalog number, vinyl color, condition — and keep a wishlist of releases you&rsquo;re hoping to find.
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            One distinction worth knowing up front: a <strong>Release</strong> and a <strong>Pressing</strong> are different things here. A Release is the release itself — e.g. <em>Kind of Blue</em> by Miles Davis, first released in 1959. A Pressing is one specific physical copy of that release you own or want — e.g. the original 1959 mono pressing, or a 2015 stereo reissue. The same Release can have many Pressings, tracked separately, so your original and a reissue never get confused with one another.
          </p>
        </section>

        <form action={completeSetup} className="space-y-8">
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Real Name (optional)</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                By default the app greets you by your email address. Enter your name here if you&rsquo;d rather see that on the home page instead.
              </p>
            </div>
            <div>
              <label className={labelClass}>Real Name</label>
              <input name="fullName" className={inputClass} placeholder="e.g. Miles Davis" />
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Discogs token (optional)</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                This app can look up releases on Discogs to save you from typing in every detail by hand. Searches use a shared token by default, which is rate-limited across every account on this app. For your own, faster rate limit:
              </p>
              <ol className="mt-2 list-decimal list-inside text-sm text-zinc-500 dark:text-zinc-400 space-y-1">
                <li>Log in to Discogs (or create a free account if you don&rsquo;t have one).</li>
                <li>
                  Go to{' '}
                  <a
                    href="https://www.discogs.com/settings/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Settings → Developers
                  </a>
                  .
                </li>
                <li>Click Generate new token, then copy it.</li>
                <li>Paste it below.</li>
              </ol>
            </div>
            <div>
              <label className={labelClass}>Discogs token</label>
              <input
                name="discogsToken"
                type="password"
                autoComplete="off"
                placeholder="Paste your Discogs token here"
                className={inputClass}
              />
            </div>
          </section>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Continue
            </button>
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
              Skip for now
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
