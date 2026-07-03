import AdminLoginForm from './AdminLoginForm'

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Admin login
        </h1>

        <AdminLoginForm />
      </div>
    </div>
  )
}
