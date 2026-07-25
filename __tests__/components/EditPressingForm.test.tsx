import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditPressingForm from '@/app/pressings/[id]/edit/EditPressingForm'

const mockUpdatePressing = jest.fn()
const mockDeletePressing = jest.fn()

jest.mock('@/app/actions/updatePressing', () => ({
  updatePressing: (...args: unknown[]) => mockUpdatePressing(...args),
}))

jest.mock('@/app/actions/deletePressing', () => ({
  deletePressing: (...args: unknown[]) => mockDeletePressing(...args),
}))

const FORMATS = [{ formatId: 1, name: 'LP' }]

const BASE_PRESSING = {
  pressingId: 7,
  releaseId: 3,
  formatId: 1,
  pressingYear: 1973,
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: null,
  discCount: 1,
  recordCondition: 'VG_PLUS',
  sleeveCondition: null,
  notes: null,
  purchasePrice: null,
  purchaseDate: null,
  currentValue: null,
  release: {
    title: 'Exodus',
    originalReleaseYear: 1977,
    coverImageUrl: null as string | null,
    artists: [{ artist: { name: 'Bob Marley & The Wailers' } }],
  },
}

describe('EditPressingForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the release cover image when one already exists, with no retrieve button', () => {
    const { container } = render(
      <EditPressingForm
        pressing={{ ...BASE_PRESSING, release: { ...BASE_PRESSING.release, coverImageUrl: 'https://i.discogs.com/cover.jpg' } }}
        formats={FORMATS}
      />
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://i.discogs.com/cover.jpg')
    expect(screen.queryByText('Retrieve cover image')).not.toBeInTheDocument()
  })

  it('shows a "Retrieve cover image" affordance when there is no cover image yet', () => {
    const { container } = render(<EditPressingForm pressing={BASE_PRESSING} formats={FORMATS} />)
    expect(screen.getByText('Retrieve cover image')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('displays the retrieved image after clicking "Retrieve cover image"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: 'https://i.discogs.com/found.jpg' }),
    }) as unknown as typeof fetch
    const user = userEvent.setup()
    const { container } = render(<EditPressingForm pressing={BASE_PRESSING} formats={FORMATS} />)

    await user.click(screen.getByText('Retrieve cover image'))

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://i.discogs.com/found.jpg')
    })
  })

  it('shows an error message when Discogs has no cover image for this release', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: null }),
    }) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<EditPressingForm pressing={BASE_PRESSING} formats={FORMATS} />)

    await user.click(screen.getByText('Retrieve cover image'))

    expect(await screen.findByText('No cover image found on Discogs for this release.')).toBeInTheDocument()
  })

  it('requires a second click on "Delete pressing" before calling deletePressing', async () => {
    const user = userEvent.setup()
    render(<EditPressingForm pressing={BASE_PRESSING} formats={FORMATS} />)

    await user.click(screen.getByText('Delete pressing'))
    expect(mockDeletePressing).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to confirm delete')).toBeInTheDocument()

    await user.click(screen.getByText('Click again to confirm delete'))
    expect(mockDeletePressing).toHaveBeenCalledWith(7)
  })

  it('submits the updated fields via updatePressing', async () => {
    const user = userEvent.setup()
    render(<EditPressingForm pressing={BASE_PRESSING} formats={FORMATS} />)

    await user.click(screen.getByText('Save changes'))

    expect(mockUpdatePressing).toHaveBeenCalledTimes(1)
    expect(mockUpdatePressing.mock.calls[0][0]).toBe(7)
  })
})
