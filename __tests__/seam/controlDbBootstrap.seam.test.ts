/**
 * @jest-environment node
 *
 * Regression test for a real deadlock, shipped in 606af93 and hit on an ordinary page
 * load on 2026-08-07.
 *
 * controlDb's bootstrap batch runs as one implicit transaction, so it holds every lock
 * it takes until the end. Its DDL reached `users` first and `sessions` second, while
 * the hot path — findSessionByTokenHash's `FROM sessions JOIN users` — locks them the
 * other way round. A request that had already locked `sessions` and wanted `users`,
 * racing a bootstrap that held `users` and wanted `sessions`, is a cycle; Postgres
 * broke it by killing the request, which reached the user as "deadlock detected".
 *
 * Bootstrap runs at module load, so this raced every process start — not an exotic
 * schedule. The fix takes both locks up front in the query's order.
 *
 * This test is deterministic in the direction that matters. It holds a reader open
 * across a real concurrent bootstrap, so with the inverted order the cycle is forced
 * rather than waited for. If the timing slips, the bootstrap simply hasn't reached its
 * blocking point yet and the test passes without exercising anything — a false pass,
 * never a false failure. It does not flake red.
 */
import { Client } from 'pg'
import {
  createScratchSchema,
  dropScratchSchema,
  generateScratchSchemaName,
} from '@/test-support/db/scratchSchema'
import { resetControlDbGlobals } from '@/test-support/db/controlDbGlobals'
import { schemaConnectionConfig } from '@/lib/dbUrls'

/** Loads controlDb fresh, which fires the bootstrap batch against the scratch schema. */
async function runBootstrap(): Promise<void> {
  await resetControlDbGlobals()
  jest.resetModules()
  const controlDb = await import('@/lib/controlDb')
  // Any query awaits the bootstrap promise, so this resolves only once it has run.
  await controlDb.findUserByEmail('nobody@vinyl-test.local')
}

describe('controlDb bootstrap vs. a concurrent session lookup (seam)', () => {
  let schema: string

  beforeAll(async () => {
    schema = generateScratchSchemaName()
    await createScratchSchema(schema)
    process.env.CONTROL_SCHEMA = schema

    // First run creates the tables. The deadlock needs both to already exist.
    await runBootstrap()
  }, 30000)

  afterAll(async () => {
    await resetControlDbGlobals()
    await dropScratchSchema(schema)
  }, 30000)

  it('does not deadlock a reader that holds sessions and then wants users', async () => {
    const reader = new Client(schemaConnectionConfig(schema))
    await reader.connect()

    let bootstrap: Promise<void> | undefined
    try {
      // Lock `sessions` and keep the transaction open, exactly as an in-flight
      // findSessionByTokenHash does between locking its two tables.
      await reader.query('BEGIN')
      await reader.query('SELECT 1 FROM sessions LIMIT 1')

      // A bootstrap now starts underneath that reader. With the DDL's original
      // ordering it grabs `users` outright and then blocks on `sessions`.
      bootstrap = runBootstrap()
      await new Promise((resolve) => setTimeout(resolve, 500))

      // The second half of the reader's lock acquisition. This is the statement that
      // closed the cycle and was chosen as the deadlock victim.
      await expect(reader.query('SELECT 1 FROM users LIMIT 1')).resolves.toBeDefined()

      await reader.query('COMMIT')
    } finally {
      await reader.end().catch(() => undefined)
      // Always settle the bootstrap, so a failure here can't leave an open handle
      // holding the Jest run open (see AGENTS.md).
      await bootstrap?.catch(() => undefined)
    }

    // The bootstrap must also have completed on its own terms — Postgres resolves a
    // deadlock by killing one side, and either side dying is the bug.
    await expect(bootstrap).resolves.toBeUndefined()
  }, 30000)
})
