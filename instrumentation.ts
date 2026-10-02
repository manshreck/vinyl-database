/**
 * Next.js calls `register` once per server instance, before the first request is
 * served — the only hook that runs early enough to catch a signal arriving seconds
 * later. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 */
export async function register() {
  // The edge runtime has no `node:fs` and no signals to record. The import is dynamic so
  // that bundling for edge never has to resolve those modules at all.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { installDevDiagnostics } = await import('@/lib/devDiagnostics')
  installDevDiagnostics()
}
