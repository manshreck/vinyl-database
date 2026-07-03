import Link from 'next/link'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Log in
        </h1>

        <LoginForm />

        <p className="mt-6 text-sm text-zinc-500">
          Don&rsquo;t have an account?{' '}
          <Link href="/register" className="text-zinc-900 dark:text-zinc-50 underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
