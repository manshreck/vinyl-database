import { hashPassword, verifyPassword } from '@/lib/password'

describe('password hashing', () => {
  it('verifies a correct password against its hash', () => {
    const hash = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects an incorrect password', () => {
    const hash = hashPassword('correct horse battery staple')
    expect(verifyPassword('wrong password', hash)).toBe(false)
  })

  it('produces a different hash (different salt) for the same password', () => {
    const a = hashPassword('same password')
    const b = hashPassword('same password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same password', a)).toBe(true)
    expect(verifyPassword('same password', b)).toBe(true)
  })

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false)
  })
})
