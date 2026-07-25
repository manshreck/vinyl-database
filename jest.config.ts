import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  // Layers 3+ (seam/system/contract) live under jest.integration.config.ts instead —
  // they need a real local Postgres and/or the real network. See TESTING.md §4.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/__tests__/(seam|system|contract)/'],
}

export default createJestConfig(config)
