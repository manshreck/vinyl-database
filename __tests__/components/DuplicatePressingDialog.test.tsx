import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicatePressingDialog from '@/app/pressings/new/DuplicatePressingDialog'
import type { ReleaseHoldings } from '@/lib/releaseIntake'

const DUPLICATE: ReleaseHoldings = {
  releaseId: 42,
  title: 'Exodus',
  originalReleaseYear: 1977,
  coverImageUrl: null,
  artistNames: ['Bob Marley'],
  pressings: [
    {
      pressingId: 7,
      formatName: 'LP',
      pressingYear: 1977,
      country: 'JA',
      label: 'Island',
      catalogNumber: 'ILPS 9498',
      vinylColor: null,
      discCount: 1,
      recordCondition: 'VG_PLUS',
      sleeveCondition: 'VG',
      purchaseDate: '2021-03-04',
    },
  ],
  wishlistItems: [],
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof DuplicatePressingDialog>> = {}) {
  const props = {
    duplicate: DUPLICATE,
    pending: false,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  }
  render(<DuplicatePressingDialog {...props} />)
  return props
}

describe('DuplicatePressingDialog', () => {
  it('names the release the user already owns', () => {
    renderDialog()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('You already own a pressing of this release')).toBeInTheDocument()
    expect(screen.getByText('Exodus')).toBeInTheDocument()
    expect(screen.getByText('Bob Marley')).toBeInTheDocument()
  })

  it('lists the particulars of the pressing already on file', () => {
    renderDialog()

    expect(
      screen.getByText('LP · 1977 · Island · ILPS 9498 · JA · Record VG+ · Sleeve VG')
    ).toBeInTheDocument()
    expect(screen.getByText('Purchased 2021-03-04')).toBeInTheDocument()
    expect(screen.getByText('View this entry')).toHaveAttribute('href', '/pressings/7')
  })

  it('omits details the existing pressing does not record', () => {
    renderDialog({
      duplicate: {
        ...DUPLICATE,
        pressings: [
          {
            ...DUPLICATE.pressings[0],
            label: null,
            catalogNumber: null,
            country: null,
            pressingYear: null,
            sleeveCondition: null,
            purchaseDate: null,
          },
        ],
      },
    })

    expect(screen.getByText('LP · Record VG+')).toBeInTheDocument()
    expect(screen.queryByText(/Purchased/)).not.toBeInTheDocument()
  })

  it('pluralizes when more than one pressing is already owned', () => {
    renderDialog({
      duplicate: {
        ...DUPLICATE,
        pressings: [
          DUPLICATE.pressings[0],
          { ...DUPLICATE.pressings[0], pressingId: 8, discCount: 2 },
        ],
      },
    })

    expect(screen.getByText('You already own 2 pressings of this release')).toBeInTheDocument()
    expect(screen.getByText(/2 discs/)).toBeInTheDocument()
  })

  it('calls onConfirm when the user chooses to add anyway', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(screen.getByText('Add anyway'))

    expect(props.onConfirm).toHaveBeenCalledTimes(1)
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel from the Cancel button and from Escape', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(screen.getByText('Cancel'))
    await user.keyboard('{Escape}')

    expect(props.onCancel).toHaveBeenCalledTimes(2)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('disables the confirm button while the confirmed save is in flight', () => {
    renderDialog({ pending: true })

    expect(screen.getByText('Saving…')).toBeDisabled()
  })

  describe('when the release is on the wishlist', () => {
    const WANTED = {
      wishlistItemId: 3,
      formatName: '10"',
      pressingYear: 1975,
      country: 'US',
      label: 'Island',
      catalogNumber: 'ILPS 9329',
      vinylColor: null,
      discCount: 1,
      identical: true,
    }

    it('warns on the wishlist alone when nothing is owned yet', () => {
      renderDialog({
        duplicate: { ...DUPLICATE, pressings: [], wishlistItems: [WANTED] },
      })

      expect(screen.getByText('This release is on your wishlist')).toBeInTheDocument()
      expect(screen.getByText('Add to collection')).toBeInTheDocument()
      expect(screen.queryByText(/You already own/)).not.toBeInTheDocument()
    })

    it('says the matching entry will be cleared, and badges it', () => {
      renderDialog({
        duplicate: { ...DUPLICATE, pressings: [], wishlistItems: [WANTED] },
      })

      expect(screen.getByText(/Saving clears the matching entry from your wishlist/)).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — this purchase fulfills it')).toBeInTheDocument()
      expect(screen.getByText('Will be removed')).toBeInTheDocument()
    })

    describe('and the entry describes a different pressing', () => {
      const differentPressing = {
        ...DUPLICATE,
        pressings: [],
        wishlistItems: [{ ...WANTED, identical: false }],
      }

      it('names the release-but-not-pressing distinction in the heading', () => {
        renderDialog({ duplicate: differentPressing })

        expect(
          screen.getByText('This release (but not this pressing) is on your wishlist')
        ).toBeInTheDocument()
        expect(screen.getByText('On your wishlist — a different pressing')).toBeInTheDocument()
      })

      it('points at the remove button by name and offers both choices', () => {
        renderDialog({ duplicate: differentPressing })

        expect(
          screen.getByText(/If you wish to also remove it from your wishlist/)
        ).toBeInTheDocument()
        expect(screen.getByText('Add to Collection (Remove from Wishlist)')).toBeInTheDocument()
        expect(screen.getByText('Add to Collection, Keep on Wishlist')).toBeInTheDocument()
        expect(screen.queryByText('Add to collection')).not.toBeInTheDocument()
      })

      it('asks to clear the wishlist only when the remove button is used', async () => {
        const user = userEvent.setup()
        const props = renderDialog({ duplicate: differentPressing })

        await user.click(screen.getByText('Add to Collection (Remove from Wishlist)'))
        expect(props.onConfirm).toHaveBeenCalledWith(true)
      })

      it('keeps the wishlist entry when the keep button is used', async () => {
        const user = userEvent.setup()
        const props = renderDialog({ duplicate: differentPressing })

        await user.click(screen.getByText('Add to Collection, Keep on Wishlist'))
        expect(props.onConfirm).toHaveBeenCalledWith(false)
      })
    })

    it('separates fulfilled from still-wanted when the wishlist holds both', () => {
      renderDialog({
        duplicate: {
          ...DUPLICATE,
          pressings: [],
          wishlistItems: [WANTED, { ...WANTED, wishlistItemId: 4, identical: false }],
        },
      })

      expect(screen.getByText('On your wishlist — this purchase fulfills it')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — a different pressing')).toBeInTheDocument()
      expect(screen.getByText('Will be removed')).toBeInTheDocument()
      // The exact match goes regardless, so only the differing entry is in question.
      expect(screen.getByText('Add to Collection (Remove from Wishlist)')).toBeInTheDocument()
      expect(screen.getByText('Add to Collection, Keep on Wishlist')).toBeInTheDocument()
    })

    it('offers a single button when nothing is left to decide', () => {
      renderDialog({ duplicate: { ...DUPLICATE, pressings: [], wishlistItems: [WANTED] } })

      expect(screen.getByText('Add to collection')).toBeInTheDocument()
      expect(screen.queryByText('Add to Collection, Keep on Wishlist')).not.toBeInTheDocument()
    })

    it('keeps the owned heading when the release is both owned and wanted', () => {
      renderDialog({ duplicate: { ...DUPLICATE, wishlistItems: [WANTED] } })

      expect(screen.getByText('You already own a pressing of this release')).toBeInTheDocument()
      expect(screen.getByText('Already in your collection')).toBeInTheDocument()
      expect(screen.getByText('On your wishlist — this purchase fulfills it')).toBeInTheDocument()
      expect(screen.getByText('Add anyway')).toBeInTheDocument()
    })
  })
})
