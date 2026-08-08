import React from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PressingsForm from '@/app/pressings/new/PressingsForm'

const mockCreatePressing = jest.fn()

jest.mock('@/app/actions/createPressing', () => ({
  createPressing: (...args: unknown[]) => mockCreatePressing(...args),
}))

describe('PressingsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as unknown as typeof fetch
  })

  it('opens directly on the manual New release form with Pressing details already visible', () => {
    const { container } = render(<PressingsForm formats={[]} genres={[]} />)

    expect(screen.getByText('New release')).toBeInTheDocument()
    expect(screen.getByText('Pressing details')).toBeInTheDocument()
    expect(container.querySelector('input[name="newReleaseTitle"]')).toHaveValue('')
  })

  it('submits once a release is created and required fields are filled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
    )

    await user.type(container.querySelector('input[name="newReleaseTitle"]') as HTMLInputElement, 'Kind of Blue')
    await user.type(
      container.querySelector('input[name="newReleaseYear"]') as HTMLInputElement,
      '1959'
    )
    await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles Davis')
    await user.selectOptions(container.querySelector('select[name="formatId"]') as HTMLSelectElement, 'LP')
    await user.selectOptions(
      container.querySelector('select[name="recordCondition"]') as HTMLSelectElement,
      'VG'
    )

    await user.click(screen.getByText('Save pressing'))

    expect(mockCreatePressing).toHaveBeenCalledTimes(1)
  })

  it('pre-populates the Title field when given an initial title', () => {
    render(<PressingsForm formats={[]} genres={[]} initialTitle="Kind of Blue" />)

    expect(screen.getByDisplayValue('Kind of Blue')).toBeInTheDocument()
  })

  it('links Cancel on the New release form to /pressings/search', () => {
    render(<PressingsForm formats={[]} genres={[]} />)

    expect(screen.getAllByText('Cancel')[0]).toHaveAttribute('href', '/pressings/search')
  })

  it('renders with a preselected release and shows Pressing details immediately', () => {
    render(
      <PressingsForm
        formats={[]}
        genres={[]}
        selectedRelease={{
          releaseId: 42,
          title: 'Kind of Blue',
          originalReleaseYear: 1959,
          coverImageUrl: null,
          artists: [{ artist: { name: 'Miles Davis' } }],
        }}
      />
    )

    expect(screen.getByText('Kind of Blue')).toBeInTheDocument()
    expect(screen.getByText('Miles Davis')).toBeInTheDocument()
    expect(screen.getByText('Pressing details')).toBeInTheDocument()
    expect(screen.queryByText('New release')).not.toBeInTheDocument()
  })

  describe('when the action reports the release is already in the collection', () => {
    const DUPLICATE = {
      releaseId: 42,
      title: 'Kind of Blue',
      originalReleaseYear: 1959,
      coverImageUrl: null,
      artistNames: ['Miles Davis'],
      pressings: [
        {
          pressingId: 7,
          formatName: 'LP',
          pressingYear: 1959,
          country: 'US',
          label: 'Columbia',
          catalogNumber: 'CL 1355',
          vinylColor: null,
          discCount: 1,
          recordCondition: 'NM',
          sleeveCondition: null,
          purchaseDate: null,
        },
      ],
      wishlistItems: [],
    }

    async function submitAgainstDuplicate() {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm
          formats={[{ formatId: 1, name: 'LP' }]}
          genres={[]}
          selectedRelease={{
            releaseId: 42,
            title: 'Kind of Blue',
            originalReleaseYear: 1959,
            coverImageUrl: null,
            artists: [{ artist: { name: 'Miles Davis' } }],
          }}
        />
      )

      await user.selectOptions(
        container.querySelector('select[name="formatId"]') as HTMLSelectElement,
        'LP'
      )
      await user.selectOptions(
        container.querySelector('select[name="recordCondition"]') as HTMLSelectElement,
        'NM'
      )
      await user.click(screen.getByText('Save pressing'))
      return user
    }

    it('shows the confirmation dialog instead of navigating away', async () => {
      mockCreatePressing.mockResolvedValue({ duplicate: DUPLICATE })

      await submitAgainstDuplicate()

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('You already own a pressing of this release')).toBeInTheDocument()
      expect(screen.getByText('LP · 1959 · Columbia · CL 1355 · US · Record NM')).toBeInTheDocument()
    })

    it('resubmits with confirmation when the user adds anyway', async () => {
      mockCreatePressing.mockResolvedValue({ duplicate: DUPLICATE })
      const user = await submitAgainstDuplicate()

      mockCreatePressing.mockResolvedValue(undefined)
      await user.click(screen.getByText('Add anyway'))

      expect(mockCreatePressing).toHaveBeenCalledTimes(2)
      const resubmitted = mockCreatePressing.mock.calls[1][0] as FormData
      expect(resubmitted.get('confirmDuplicate')).toBe('true')
      expect(resubmitted.get('releaseId')).toBe('42')
      expect(resubmitted.get('recordCondition')).toBe('NM')
    })

    it('does not resubmit when the user cancels, and keeps the form filled in', async () => {
      mockCreatePressing.mockResolvedValue({ duplicate: DUPLICATE })
      const user = await submitAgainstDuplicate()

      await user.click(within(screen.getByRole('dialog')).getByText('Cancel'))

      expect(mockCreatePressing).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Pressing details')).toBeInTheDocument()
    })

    it('sends removeFromWishlist only when that button is chosen', async () => {
      const WITH_WISHLIST = {
        ...DUPLICATE,
        pressings: [],
        wishlistItems: [
          {
            wishlistItemId: 5,
            formatName: 'LP',
            pressingYear: 1997,
            country: 'US',
            label: 'Columbia',
            catalogNumber: 'CL 1355',
            vinylColor: null,
            discCount: 1,
            identical: false,
          },
        ],
      }
      mockCreatePressing.mockResolvedValue({ duplicate: WITH_WISHLIST })
      const user = await submitAgainstDuplicate()

      mockCreatePressing.mockResolvedValue(undefined)
      await user.click(screen.getByText('Add to Collection, Keep on Wishlist'))

      const kept = mockCreatePressing.mock.calls[1][0] as FormData
      expect(kept.get('confirmDuplicate')).toBe('true')
      expect(kept.get('removeFromWishlist')).toBeNull()
    })

    it('sets removeFromWishlist when the remove button is chosen', async () => {
      const WITH_WISHLIST = {
        ...DUPLICATE,
        pressings: [],
        wishlistItems: [
          {
            wishlistItemId: 5,
            formatName: 'LP',
            pressingYear: 1997,
            country: 'US',
            label: 'Columbia',
            catalogNumber: 'CL 1355',
            vinylColor: null,
            discCount: 1,
            identical: false,
          },
        ],
      }
      mockCreatePressing.mockResolvedValue({ duplicate: WITH_WISHLIST })
      const user = await submitAgainstDuplicate()

      mockCreatePressing.mockResolvedValue(undefined)
      await user.click(screen.getByText('Add to Collection (Remove from Wishlist)'))

      const removed = mockCreatePressing.mock.calls[1][0] as FormData
      expect(removed.get('confirmDuplicate')).toBe('true')
      expect(removed.get('removeFromWishlist')).toBe('true')
    })

    it('leaves the submit button usable again after cancelling', async () => {
      mockCreatePressing.mockResolvedValue({ duplicate: DUPLICATE })
      const user = await submitAgainstDuplicate()
      await user.click(within(screen.getByRole('dialog')).getByText('Cancel'))

      expect(screen.getByText('Save pressing')).not.toBeDisabled()
    })
  })

  it('links Change on a preselected release to /pressings/search', () => {
    render(
      <PressingsForm
        formats={[]}
        genres={[]}
        selectedRelease={{
          releaseId: 42,
          title: 'Kind of Blue',
          originalReleaseYear: 1959,
          coverImageUrl: null,
          artists: [{ artist: { name: 'Miles Davis' } }],
        }}
      />
    )

    expect(screen.getByText('Change')).toHaveAttribute('href', '/pressings/search')
  })

  // Fields never auto-populated from Discogs (Record condition, Sleeve condition,
  // Purchase price, Purchase date, Current value) are flagged with a pale red border
  // until the user touches that specific field.
  describe('attention highlighting on never-auto-populated fields', () => {
    it('starts all five fields highlighted red', () => {
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )

      for (const selector of [
        'select[name="recordCondition"]',
        'select[name="sleeveCondition"]',
        'input[name="purchasePrice"]',
        'input[name="purchaseDate"]',
        'input[name="currentValue"]',
      ]) {
        expect(container.querySelector(selector)).toHaveClass('border-red-300')
      }
    })

    it('clears the highlight on Record condition once it is changed, and no others', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )

      await user.selectOptions(container.querySelector('select[name="recordCondition"]') as HTMLSelectElement, 'VG')

      expect(container.querySelector('select[name="recordCondition"]')).not.toHaveClass('border-red-300')
      expect(container.querySelector('select[name="sleeveCondition"]')).toHaveClass('border-red-300')
      expect(container.querySelector('input[name="purchasePrice"]')).toHaveClass('border-red-300')
    })

    it('clears the highlight on Purchase date once it is changed', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchaseDate = container.querySelector('input[name="purchaseDate"]') as HTMLInputElement

      await user.type(purchaseDate, '2024-01-15')

      expect(purchaseDate).not.toHaveClass('border-red-300')
    })
  })

  describe('Purchase price mirroring into Current value', () => {
    it('mirrors Purchase price into Current value as it is typed', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '35')

      expect(currentValue).toHaveValue(35)
    })

    it('keeps Current value highlighted red even after it is auto-filled from Purchase price', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '35')

      expect(currentValue).toHaveClass('border-red-300')
    })

    it('stops mirroring once Current value has been edited directly, and clears its highlight', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '35')
      await user.clear(currentValue)
      await user.type(currentValue, '50')
      expect(currentValue).not.toHaveClass('border-red-300')

      await user.clear(purchasePrice)
      await user.type(purchasePrice, '99')

      expect(currentValue).toHaveValue(50)
    })

    it('submits the exact purchase price and current value entered when they differ', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '45.99')
      await user.clear(currentValue)
      await user.type(currentValue, '75.50')

      await user.type(container.querySelector('input[name="newReleaseTitle"]') as HTMLInputElement, 'Kind of Blue')
      await user.type(container.querySelector('input[name="newReleaseYear"]') as HTMLInputElement, '1959')
      await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles Davis')
      await user.selectOptions(container.querySelector('select[name="formatId"]') as HTMLSelectElement, 'LP')
      await user.selectOptions(container.querySelector('select[name="recordCondition"]') as HTMLSelectElement, 'VG')

      await user.click(screen.getByText('Save pressing'))

      expect(mockCreatePressing).toHaveBeenCalledTimes(1)
      const [formData] = mockCreatePressing.mock.calls[0]
      expect(formData.get('purchasePrice')).toBe('45.99')
      expect(formData.get('currentValue')).toBe('75.5')
    })
  })

  describe('number input scroll protection', () => {
    it('blurs Purchase price on wheel so scrolling cannot silently change its value', () => {
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      purchasePrice.focus()
      expect(document.activeElement).toBe(purchasePrice)

      fireEvent.wheel(purchasePrice)

      expect(document.activeElement).not.toBe(purchasePrice)
    })

    it('blurs Current value on wheel so scrolling cannot silently change its value', () => {
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement
      currentValue.focus()
      expect(document.activeElement).toBe(currentValue)

      fireEvent.wheel(currentValue)

      expect(document.activeElement).not.toBe(currentValue)
    })
  })

  // The artist box is a search field that is also pre-filled from Discogs, so it has
  // to tell a search term apart from a settled value. Getting that wrong offered a
  // dropdown whose only entry duplicated the name already in the field.
  describe('artist autocomplete only searches for typed text', () => {
    /** Waits past the 300ms debounce, letting any state it schedules settle inside act. */
    const settleDebounce = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
      })

    const discogsValues = {
      title: 'Kind of Blue',
      originalReleaseYear: 1959,
      pressingYear: null,
      artistName: 'Miles Davis',
      genreIds: [],
      formatId: null,
      country: null,
      label: null,
      catalogNumber: null,
      discCount: 1,
      vinylColor: null,
      coverImageUrl: null,
    }

    it('does not search for an artist name arriving pre-filled from Discogs', async () => {
      render(<PressingsForm formats={[]} genres={[]} initialValues={discogsValues} />)

      expect(screen.getByPlaceholderText('Search or enter artist name…')).toHaveValue('Miles Davis')

      // Long enough for the 300ms debounce to have fired had anything scheduled it.
      await settleDebounce()

      const searched = (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).includes('/api/artists/search')
      )
      expect(searched).toBe(false)
    })

    it('searches once the user actually types', async () => {
      const user = userEvent.setup()
      render(<PressingsForm formats={[]} genres={[]} />)

      await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles')
      await settleDebounce()

      const searched = (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).includes('/api/artists/search')
      )
      expect(searched).toBe(true)
    })

    it('does not reopen the dropdown after an artist is picked', async () => {
      const user = userEvent.setup()
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve([{ artistId: 7, name: 'Miles Davis', sortName: 'Davis, Miles' }]),
      }) as unknown as typeof fetch

      render(<PressingsForm formats={[]} genres={[]} />)
      const input = screen.getByPlaceholderText('Search or enter artist name…')

      await user.type(input, 'Miles')
      const option = await screen.findByRole('button', { name: 'Miles Davis' })
      await user.click(option)

      expect(input).toHaveValue('Miles Davis')

      // Selecting sets the query to the chosen name, which would re-trigger the
      // debounced search and pop the dropdown open again on top of the settled value.
      await settleDebounce()

      expect(screen.queryByRole('button', { name: 'Miles Davis' })).not.toBeInTheDocument()
    })
  })
})
