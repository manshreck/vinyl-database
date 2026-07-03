import Link from 'next/link'
import RegisterForm from './RegisterForm'

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Create your collection
        </h1>

        <RegisterForm />

        <p className="mt-6 text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-zinc-900 dark:text-zinc-50 underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
