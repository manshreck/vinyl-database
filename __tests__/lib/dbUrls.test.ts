/**
 * @jest-environment node
 */
import {
  assertSafeSchemaName,
  controlConnectionConfig,
  controlSchema,
  databaseUrl,
  schemaConnectionConfig,
} from '@/lib/dbUrls'

const URL = 'postgresql://user:pass@localhost:5432/vinyl'

beforeEach(() => {
  process.env.DATABASE_URL = URL
  delete process.env.CONTROL_SCHEMA
})

afterEach(() => {
  delete process.env.DATABASE_URL
  delete process.env.CONTROL_SCHEMA
})

describe('schemaConnectionConfig', () => {
  it('keeps DATABASE_URL untouched — tenancy is the search_path, not the database', () => {
    expect(schemaConnectionConfig('vinyl_user_abc123abc123').connectionString).toBe(URL)
  })

  it('resolves unqualified names in the requested schema', () => {
    expect(schemaConnectionConfig('vinyl_user_abc123abc123').options).toBe(
      '-c search_path=vinyl_user_abc123abc123'
    )
  })

  it('preserves a query string on DATABASE_URL', () => {
    process.env.DATABASE_URL = `${URL}?sslmode=require`
    expect(schemaConnectionConfig('control').connectionString).toBe(`${URL}?sslmode=require`)
  })

  it('differs per schema', () => {
    expect(schemaConnectionConfig('vinyl_user_aaaaaaaaaaaa').options).not.toBe(
      schemaConnectionConfig('vinyl_user_bbbbbbbbbbbb').options
    )
  })
})

/**
 * The injection boundary. search_path and CREATE SCHEMA cannot be parameterized, so
 * every schema name reaches Postgres by interpolation and this guard is the only
 * thing between a name and a statement.
 */
describe('assertSafeSchemaName', () => {
  it.each([
    'vinyl_user_0123456789ab',
    'vinyl_test_0123456789ab',
    'control',
    'public',
  ])('accepts the names this application actually uses: %s', (name) => {
    expect(() => assertSafeSchemaName(name)).not.toThrow()
  })

  it.each([
    ['a quote', `x'`],
    ['a double quote', 'x"'],
    ['a statement terminator', 'x; DROP SCHEMA control CASCADE'],
    ['a comment', 'x -- rest'],
    ['a space', 'two words'],
    ['an options flag', 'x -c search_path=control'],
    ['a backslash', 'x\\y'],
    ['a newline', 'x\ny'],
    ['uppercase', 'Control'],
    ['a leading digit', '1schema'],
    ['a hyphen', 'vinyl-user'],
    ['empty', ''],
    ['over 63 characters', 'a'.repeat(64)],
  ])('rejects %s', (_label, name) => {
    expect(() => assertSafeSchemaName(name)).toThrow(/Unsafe schema name/)
  })

  it('is applied by schemaConnectionConfig before building the options string', () => {
    expect(() => schemaConnectionConfig('x; DROP SCHEMA control CASCADE')).toThrow(
      /Unsafe schema name/
    )
  })
})

describe('controlSchema', () => {
  it('defaults to "control"', () => {
    expect(controlSchema()).toBe('control')
    expect(controlConnectionConfig().options).toBe('-c search_path=control')
  })

  // How seam/system tests point a reloaded controlDb at a scratch schema.
  it('honours a CONTROL_SCHEMA override', () => {
    process.env.CONTROL_SCHEMA = 'vinyl_test_0123456789ab'
    expect(controlSchema()).toBe('vinyl_test_0123456789ab')
    expect(controlConnectionConfig().options).toBe('-c search_path=vinyl_test_0123456789ab')
  })

  it('validates the override rather than trusting the environment', () => {
    process.env.CONTROL_SCHEMA = 'evil; DROP SCHEMA control CASCADE'
    expect(() => controlConnectionConfig()).toThrow(/Unsafe schema name/)
  })
})

describe('databaseUrl', () => {
  it('is DATABASE_URL verbatim', () => {
    expect(databaseUrl()).toBe(URL)
  })
})
