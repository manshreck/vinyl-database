import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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
})
