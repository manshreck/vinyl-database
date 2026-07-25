import { resolvePage, PAGE_SIZE } from '@/lib/pagination'

describe('resolvePage', () => {
  it('defaults to page 1 when no param is given', () => {
    expect(resolvePage(undefined, 100)).toEqual({ currentPage: 1, totalPages: 4 })
  })

  it('computes totalPages for a count that is an exact multiple of the page size', () => {
    expect(resolvePage('1', 75)).toEqual({ currentPage: 1, totalPages: 3 })
  })

  it('rounds totalPages up for a remainder', () => {
    expect(resolvePage('1', 26)).toEqual({ currentPage: 1, totalPages: 2 })
  })

  it('returns totalPages 1 for a zero count', () => {
    expect(resolvePage(undefined, 0)).toEqual({ currentPage: 1, totalPages: 1 })
  })

  it('clamps a page param past the last page down to the last page', () => {
    expect(resolvePage('99', 30)).toEqual({ currentPage: 2, totalPages: 2 })
  })

  it('clamps a zero or negative page param up to page 1', () => {
    expect(resolvePage('0', 100)).toEqual({ currentPage: 1, totalPages: 4 })
    expect(resolvePage('-5', 100)).toEqual({ currentPage: 1, totalPages: 4 })
  })

  it('falls back to page 1 for a non-numeric param', () => {
    expect(resolvePage('not-a-number', 100)).toEqual({ currentPage: 1, totalPages: 4 })
  })

  it('respects a custom page size', () => {
    expect(resolvePage('2', 30, 10)).toEqual({ currentPage: 2, totalPages: 3 })
  })

  it('uses the shared PAGE_SIZE constant by default', () => {
    expect(resolvePage('1', PAGE_SIZE + 1)).toEqual({ currentPage: 1, totalPages: 2 })
  })
})
