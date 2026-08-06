import type { Pool } from 'pg'

/**
 * controlDb.ts memoizes its Pool and bootstrap-SQL promise on globalThis (to survive
 * Next.js dev-mode hot reload) and resolves its connection config at module-load time.
 * Any test that reloads controlDb.ts against a different schema — directly, or via
 * a caller like registerUser.ts that imports it — must reset this same cache, or the
 * next load reuses a pool still bound to the previous schema, and the next close
 * tries to end a pool that's already been ended. Shared by
 * __tests__/seam/controlDb.seam.test.ts and __tests__/system/registration.system.test.ts.
 */
type ControlDbGlobal = { controlPool?: Pool; controlPoolReady?: Promise<void> }

/** Closes the cached pool (if any) and clears the globalThis cache, so the next load or close never touches an already-ended pool. */
export async function resetControlDbGlobals(): Promise<void> {
  const global = globalThis as unknown as ControlDbGlobal
  // Let any in-flight bootstrap finish before closing the pool underneath it —
  // otherwise it lands on an ended pool. Failures are irrelevant here: the pool is
  // being discarded either way.
  if (global.controlPoolReady) await global.controlPoolReady.catch(() => undefined)
  if (global.controlPool) await global.controlPool.end()
  delete global.controlPool
  delete global.controlPoolReady
}
