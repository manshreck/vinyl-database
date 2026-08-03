import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicateWishlistDialog from '@/app/wishlist/new/DuplicateWishlistDialog'
import type {
  ExistingPressingSummary,
  ExistingWishlistSummary,
  ReleaseHoldings,
} from '@/lib/releaseIntake'

const OWNED_PRESSING: ExistingPressingSummary = {
  pressingId: 9,
  formatName: 'LP',
  pressingYear: 1977,
  country: 'JA',
  label: 'Island',
  catalogNumber: 'ILPS 9498',
  vinylColor: null,
  discCount: 1,
  recordCondition: 'VG_PLUS',
  sleeveCondition: null,
  purchaseDate: null,
}

const WANTED_ITEM: ExistingWishlistSummary = {
  wishlistItemId: 3,
  formatName: '12"',
  pressingYear: 1975,
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: null,
  discCount: 1,
  identical: false,
}

function base(overrides: Partial<ReleaseHoldings> = {}): ReleaseHoldings {
  return {
    releaseId: 42,
    title: 'Exodus',
    originalReleaseYear: 1977,
    coverImageUrl: null,
    artistNames: ['Bob Marley'],
    pressings: [],
    wishlistItems: [],
    ...overrides,
  }
}

function renderDialog(duplicate: ReleaseHoldings, pending = false) {
  const props = { duplicate, pending, onConfirm: jest.fn(), onCancel: jest.fn() }
  render(<DuplicateWishlistDialog {...props} />)
  return props
}

describe('DuplicateWishlistDialog', () => {
  describe('when the release is only in the collection', () => {
    const duplicate = base({ pressings: [OWNED_PRESSING] })

    it('says you already own it and treats wanting another pressing as reasonable', () => {
      renderDialog(duplicate)

      expect(screen.getByText('You already own this release')).toBeInTheDocument()
      expect(screen.getByText(/hunting for a different pressing/)).toBeInTheDocument()
    })

    it('lists the pressing you own, with its condition', () => {
      renderDialog(duplicate)

      expect(screen.getByText('Already in your collection')).toBeInTheDocument()
      expect(
        screen.getByText('LP · 1977 · Island · ILPS 9498 · JA · Record VG+')
      ).toBeInTheDocument()
      expect(screen.getByText('View this entry')).toHaveAttribute('href', '/pressings/9')
    })

    it('offers a plain confirm button', () => {
      renderDialog(duplicate)

      expect(screen.getByText('Add to wishlist')).toBeInTheDocument()
    })
  })

  describe('when the wishlist has the release under different pressing details', () => {
    const duplicate = base({ wishlistItems: [WANTED_ITEM] })

    it('says the release is already wanted, without escalating', () => {
      renderDialog(duplicate)

      expect(screen.getByText('This release is already on your wishlist')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — different pressing')).toBeInTheDocument()
      expect(screen.getByText('Add to wishlist')).toBeInTheDocument()
    })

    it('lists the wanted pressing without condition grades', () => {
      renderDialog(duplicate)

      expect(screen.getByText('12" · 1975 · Island · ILPS 9329 · US')).toBeInTheDocument()
      expect(screen.getByText('View this entry')).toHaveAttribute('href', '/wishlist/3')
    })

    it('does not badge anything as an exact match', () => {
      renderDialog(duplicate)

      expect(screen.queryByText('Exact match')).not.toBeInTheDocument()
    })
  })

  describe('when the wishlist already has this exact pressing', () => {
    const duplicate = base({ wishlistItems: [{ ...WANTED_ITEM, identical: true }] })

    it('escalates the heading to name the exact pressing', () => {
      renderDialog(duplicate)

      expect(screen.getByText('This exact pressing is already on your wishlist')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — same pressing')).toBeInTheDocument()
      expect(screen.getByText('Exact match')).toBeInTheDocument()
    })

    it('spells out that confirming duplicates rather than edits, and names the bulk-buy case', () => {
      renderDialog(duplicate)

      expect(screen.getByText(/adds a second, identical entry/)).toBeInTheDocument()
      expect(screen.getByText(/almost never what you want/)).toBeInTheDocument()
      expect(screen.getByText(/buying in bulk/)).toBeInTheDocument()
    })

    it('makes the confirm button spell out the consequence', () => {
      renderDialog(duplicate)

      expect(screen.getByText('Yes, add a second identical entry')).toBeInTheDocument()
      expect(screen.queryByText('Add to wishlist')).not.toBeInTheDocument()
    })
  })

  describe('when the release is both owned and wanted', () => {
    it('shows every collision, and the exact match wins the heading', () => {
      renderDialog(
        base({
          pressings: [OWNED_PRESSING],
          wishlistItems: [
            { ...WANTED_ITEM, identical: true },
            { ...WANTED_ITEM, wishlistItemId: 4, pressingYear: 2015, identical: false },
          ],
        })
      )

      expect(screen.getByText('This exact pressing is already on your wishlist')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — same pressing')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — other pressings')).toBeInTheDocument()
      expect(screen.getByText('Already in your collection')).toBeInTheDocument()
    })
  })

  it('names the release being added in every case', () => {
    renderDialog(base({ pressings: [OWNED_PRESSING] }))

    expect(screen.getByText('Exodus')).toBeInTheDocument()
    expect(screen.getByText('Bob Marley')).toBeInTheDocument()
  })

  it('confirms and cancels', async () => {
    const user = userEvent.setup()
    const props = renderDialog(base({ pressings: [OWNED_PRESSING] }))

    await user.click(screen.getByText('Add to wishlist'))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('Cancel'))
    await user.keyboard('{Escape}')
    expect(props.onCancel).toHaveBeenCalledTimes(2)
  })

  it('disables the confirm button while the confirmed save is in flight', () => {
    renderDialog(base({ pressings: [OWNED_PRESSING] }), true)

    expect(screen.getByText('Saving…')).toBeDisabled()
  })
})
