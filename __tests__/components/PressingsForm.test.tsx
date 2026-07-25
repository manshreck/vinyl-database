import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PressingsForm from '@/app/pressings/new/PressingsForm'

const mockCreatePressing = jest.fn()
const mockPush = jest.fn()

jest.mock('@/app/actions/createPressing', () => ({
  createPressing: (...args: unknown[]) => mockCreatePressing(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('PressingsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as unknown as typeof fetch
  })

  it('does not submit when Enter is pressed in the release search box before a release is chosen', async () => {
    const user = userEvent.setup()
    render(<PressingsForm formats={[]} genres={[]} />)

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue{Enter}')

    expect(mockCreatePressing).not.toHaveBeenCalled()
  })

  it('submits once a release is created and required fields are filled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
    )

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
    await user.click(screen.getByText(/No results/))

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

  describe('Search for Release on Discogs', () => {
    it('navigates to /discogs with the entered query when Search is clicked', async () => {
      const user = userEvent.setup()
      render(<PressingsForm formats={[]} genres={[]} />)

      await user.type(screen.getByPlaceholderText('e.g. Kind of Blue, Miles Davis'), 'Exodus Bob Marley')
      await user.click(screen.getByText('Search'))

      expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Exodus Bob Marley'))
    })

    it('navigates to /discogs with no query when the box is left blank', async () => {
      const user = userEvent.setup()
      render(<PressingsForm formats={[]} genres={[]} />)

      await user.click(screen.getByText('Search'))

      expect(mockPush).toHaveBeenCalledWith('/discogs')
    })

    it('submits on Enter without triggering local release creation', async () => {
      const user = userEvent.setup()
      render(<PressingsForm formats={[]} genres={[]} />)

      await user.type(screen.getByPlaceholderText('e.g. Kind of Blue, Miles Davis'), 'Exodus{Enter}')

      expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Exodus'))
      expect(mockCreatePressing).not.toHaveBeenCalled()
    })
  })

  // Fields never auto-populated from Discogs (Record condition, Sleeve condition,
  // Purchase price, Purchase date, Current value) are flagged with a pale red border
  // until the user touches that specific field.
  describe('attention highlighting on never-auto-populated fields', () => {
    async function renderWithReleaseCreated() {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
      await user.click(screen.getByText(/No results/))
      return { user, container }
    }

    it('starts all five fields highlighted red', async () => {
      const { container } = await renderWithReleaseCreated()

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
      const { user, container } = await renderWithReleaseCreated()

      await user.selectOptions(container.querySelector('select[name="recordCondition"]') as HTMLSelectElement, 'VG')

      expect(container.querySelector('select[name="recordCondition"]')).not.toHaveClass('border-red-300')
      expect(container.querySelector('select[name="sleeveCondition"]')).toHaveClass('border-red-300')
      expect(container.querySelector('input[name="purchasePrice"]')).toHaveClass('border-red-300')
    })

    it('clears the highlight on Purchase date once it is changed', async () => {
      const { user, container } = await renderWithReleaseCreated()
      const purchaseDate = container.querySelector('input[name="purchaseDate"]') as HTMLInputElement

      await user.type(purchaseDate, '2024-01-15')

      expect(purchaseDate).not.toHaveClass('border-red-300')
    })
  })

  describe('Purchase price mirroring into Current value', () => {
    async function renderWithReleaseCreated() {
      const user = userEvent.setup()
      const { container } = render(
        <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
      )
      await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
      await user.click(screen.getByText(/No results/))
      return { user, container }
    }

    it('mirrors Purchase price into Current value as it is typed', async () => {
      const { user, container } = await renderWithReleaseCreated()
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '35')

      expect(currentValue).toHaveValue(35)
    })

    it('keeps Current value highlighted red even after it is auto-filled from Purchase price', async () => {
      const { user, container } = await renderWithReleaseCreated()
      const purchasePrice = container.querySelector('input[name="purchasePrice"]') as HTMLInputElement
      const currentValue = container.querySelector('input[name="currentValue"]') as HTMLInputElement

      await user.type(purchasePrice, '35')

      expect(currentValue).toHaveClass('border-red-300')
    })

    it('stops mirroring once Current value has been edited directly, and clears its highlight', async () => {
      const { user, container } = await renderWithReleaseCreated()
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
  })
})
