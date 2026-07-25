/**
 * @jest-environment node
 */
import { adminConnectionString, tenantConnectionString } from '@/lib/dbUrls'

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/vinyl_database'
})

afterEach(() => {
  delete process.env.DATABASE_URL
})

describe('tenantConnectionString', () => {
  it('replaces the database name in the path', () => {
    expect(tenantConnectionString('vinyl_user_abc123')).toBe(
      'postgresql://user:pass@localhost:5432/vinyl_user_abc123'
    )
  })

  it('preserves host, port, and credentials from DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://alice:s3cret@db.internal:6543/vinyl_database'
    expect(tenantConnectionString('vinyl_user_xyz')).toBe(
      'postgresql://alice:s3cret@db.internal:6543/vinyl_user_xyz'
    )
  })

  it('preserves a query string from DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/vinyl_database?sslmode=require'
    expect(tenantConnectionString('vinyl_user_abc123')).toBe(
      'postgresql://user:pass@localhost:5432/vinyl_user_abc123?sslmode=require'
    )
  })

  it('returns a different string for different database names', () => {
    const a = tenantConnectionString('vinyl_user_aaa')
    const b = tenantConnectionString('vinyl_user_bbb')
    expect(a).not.toBe(b)
  })
})

describe('adminConnectionString', () => {
  it('points at the "postgres" maintenance database', () => {
    expect(adminConnectionString()).toBe('postgresql://user:pass@localhost:5432/postgres')
  })

  it('preserves host, port, and credentials from DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://alice:s3cret@db.internal:6543/vinyl_database'
    expect(adminConnectionString()).toBe('postgresql://alice:s3cret@db.internal:6543/postgres')
  })
})
