/**
 * @jest-environment node
 */
import { updatePressing } from '@/app/actions/updatePressing'

const mockUpdate = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    pressing: { update: (...args: unknown[]) => mockUpdate(...args) },
  },
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value)
  }
  return fd
}

const BASE_FIELDS = {
  formatId: '1',
  recordCondition: 'VG_PLUS',
  sleeveCondition: '',
  pressingYear: '1973',
  country: 'US',
  label: 'Columbia',
  catalogNumber: 'PC 32340',
  vinylColor: '',
  discCount: '1',
  notes: '',
  purchasePrice: '',
  purchaseDate: '',
  currentValue: '',
}

describe('updatePressing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate.mockResolvedValue({})
  })

  it('calls prisma.pressing.update with the correct id', async () => {
    await updatePressing(7, makeFormData(BASE_FIELDS))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pressingId: 7 } })
    )
  })

  it('maps form fields to the correct data shape', async () => {
    await updatePressing(7, makeFormData(BASE_FIELDS))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formatId: 1,
          recordCondition: 'VG_PLUS',
          pressingYear: 1973,
          country: 'US',
          label: 'Columbia',
          catalogNumber: 'PC 32340',
        }),
      })
    )
  })

  it('sets sleeveCondition to null when blank', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, sleeveCondition: '' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sleeveCondition: null }) })
    )
  })

  it('sets sleeveCondition when provided', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, sleeveCondition: 'NM' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sleeveCondition: 'NM' }) })
    )
  })

  it('sets pressingYear to null when blank', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, pressingYear: '' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pressingYear: null }) })
    )
  })

  it('sets currentValue to null when blank', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, currentValue: '' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentValue: null }) })
    )
  })

  it('sets currentValue when provided', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, currentValue: '25.99' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentValue: 25.99 }) })
    )
  })

  it('trims whitespace from text fields', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, label: '  Blue Note  ', country: '  JP  ' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'Blue Note', country: 'JP' }),
      })
    )
  })

  it('sets label to null when empty after trim', async () => {
    await updatePressing(7, makeFormData({ ...BASE_FIELDS, label: '   ' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: null }) })
    )
  })

  it('redirects to /pressings after update', async () => {
    await updatePressing(7, makeFormData(BASE_FIELDS))
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })
})
