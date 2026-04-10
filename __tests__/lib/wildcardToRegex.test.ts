import { wildcardToRegex } from '@/lib/wildcardToRegex'

describe('wildcardToRegex', () => {
  it('returns the input unchanged when no special characters are present', () => {
    expect(wildcardToRegex('hello')).toBe('hello')
  })

  it('converts * to .* for matching any sequence', () => {
    expect(wildcardToRegex('hel*')).toBe('hel.*')
    expect(wildcardToRegex('*world')).toBe('.*world')
    expect(wildcardToRegex('*')).toBe('.*')
  })

  it('converts ? to . for matching a single character', () => {
    expect(wildcardToRegex('hel?o')).toBe('hel.o')
    expect(wildcardToRegex('?')).toBe('.')
  })

  it('handles both * and ? in the same pattern', () => {
    expect(wildcardToRegex('hel?o *')).toBe('hel.o .*')
  })

  it('escapes regex metacharacters so they are treated as literals', () => {
    expect(wildcardToRegex('(test)')).toBe('\\(test\\)')
    expect(wildcardToRegex('a.b')).toBe('a\\.b')
    expect(wildcardToRegex('a+b')).toBe('a\\+b')
    expect(wildcardToRegex('a^b')).toBe('a\\^b')
    expect(wildcardToRegex('a$b')).toBe('a\\$b')
    expect(wildcardToRegex('a{1}')).toBe('a\\{1\\}')
    expect(wildcardToRegex('a[b]')).toBe('a\\[b\\]')
    expect(wildcardToRegex('a|b')).toBe('a\\|b')
    expect(wildcardToRegex('a\\b')).toBe('a\\\\b')
  })

  it('escapes a literal dot but still expands an adjacent wildcard star', () => {
    // '.' is a regex metachar → escaped to '\.'
    // '*' is a wildcard → expanded to '.*'
    expect(wildcardToRegex('Miles.*Davis')).toBe('Miles\\..*Davis')
  })

  it('handles an empty string', () => {
    expect(wildcardToRegex('')).toBe('')
  })
})
