import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

// Layers 3+ (seam/system/contract) — hits a real local Postgres and, for the Discogs
// contract test, the real network. Separate from jest.config.ts so `npm test` never
// gains an external dependency. See TESTING_PLAN.md §4.
const config: Config = {
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/{seam,system,contract}/**/*.test.ts'],
  testTimeout: 30000,
}

export default createJestConfig(config)
