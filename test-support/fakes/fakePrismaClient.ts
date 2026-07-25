/**
 * In-memory fake of the subset of PrismaClient this app actually calls — see
 * TESTING_PLAN.md §1.2 and swe-test-doubles. This is a fake (a reimplementation), not
 * a proxy: it exists to consolidate the near-identical ad hoc `jest.fn()` mocks
 * duplicated across `__tests__/actions/*.test.ts` into one owner-maintained
 * implementation, raising unit-test fidelity (a real create-then-read instead of a
 * stub returning whatever was hardcoded). It does not stand in for a seam or system
 * integration test — see __tests__/contract/fakePrismaClient.contract.test.ts, which
 * proves it agrees with the real generated client, and TESTING_PLAN.md §2.3 for the
 * seam tests that exercise the real database directly.
 *
 * Scope is deliberately exactly the operations the app makes today (see the survey
 * behind TESTING_PLAN.md Phase 2) — not a general Prisma reimplementation. Anything
 * outside that surface throws immediately rather than silently misbehaving, per the
 * "fakes should fail fast on unsupported paths" rule.
 *
 * Not modeled: Prisma's Decimal type for purchasePrice/currentValue (the app only
 * ever calls Number() on them — plain numbers satisfy every consumer); real
 * transaction rollback semantics beyond a best-effort snapshot/restore (no test today
 * depends on partial-failure atomicity within a single $transaction callback).
 */

type ConditionGrade = 'P' | 'FR' | 'G' | 'G_PLUS' | 'VG_MINUS' | 'VG' | 'VG_PLUS' | 'NM' | 'M' | 'S'

type ArtistRow = { artistId: number; name: string; sortName: string; createdAt: Date }
type GenreRow = { genreId: number; name: string }
type FormatRow = { formatId: number; name: string; description: string | null }
type ReleaseRow = {
  releaseId: number
  title: string
  originalReleaseYear: number
  notes: string | null
  coverImageUrl: string | null
  createdAt: Date
  updatedAt: Date
}
type ReleaseArtistRow = { releaseId: number; artistId: number; artistOrder: number; role: string }
type ReleaseGenreRow = { releaseId: number; genreId: number; genreOrder: number }
type PressingRow = {
  pressingId: number
  releaseId: number
  formatId: number
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  recordCondition: ConditionGrade
  sleeveCondition: ConditionGrade | null
  notes: string | null
  purchasePrice: number | null
  purchaseDate: Date | null
  currentValue: number | null
  createdAt: Date
  updatedAt: Date
}
type WishlistItemRow = {
  wishlistItemId: number
  releaseId: number
  formatId: number
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type Store = {
  artists: Map<number, ArtistRow>
  genres: Map<number, GenreRow>
  formats: Map<number, FormatRow>
  releases: Map<number, ReleaseRow>
  releaseArtists: ReleaseArtistRow[]
  releaseGenres: ReleaseGenreRow[]
  pressings: Map<number, PressingRow>
  wishlistItems: Map<number, WishlistItemRow>
  nextId: Record<string, number>
}

function emptyStore(): Store {
  return {
    artists: new Map(),
    genres: new Map(),
    formats: new Map(),
    releases: new Map(),
    releaseArtists: [],
    releaseGenres: [],
    pressings: new Map(),
    wishlistItems: new Map(),
    nextId: {},
  }
}

function nextId(store: Store, key: string): number {
  const id = (store.nextId[key] ?? 0) + 1
  store.nextId[key] = id
  return id
}

function unsupported(op: string): never {
  throw new Error(
    `fakePrismaClient: "${op}" is outside the fake's supported surface. ` +
      `Either extend the fake (and its contract test) to cover it, or use a real/proxy database instead.`
  )
}

// ---- relation attachment helpers -------------------------------------------------

function attachArtist(store: Store, ra: ReleaseArtistRow) {
  const artist = store.artists.get(ra.artistId)
  if (!artist) throw new Error(`fakePrismaClient: dangling artistId ${ra.artistId} on release_artists`)
  return { ...ra, artist }
}

function releaseArtistsFor(store: Store, releaseId: number) {
  return store.releaseArtists
    .filter((ra) => ra.releaseId === releaseId)
    .sort((a, b) => a.artistOrder - b.artistOrder)
    .map((ra) => attachArtist(store, ra))
}

function attachGenre(store: Store, rg: ReleaseGenreRow) {
  const genre = store.genres.get(rg.genreId)
  if (!genre) throw new Error(`fakePrismaClient: dangling genreId ${rg.genreId} on release_genres`)
  return { ...rg, genre }
}

function releaseGenresFor(store: Store, releaseId: number) {
  return store.releaseGenres
    .filter((rg) => rg.releaseId === releaseId)
    .sort((a, b) => a.genreOrder - b.genreOrder)
    .map((rg) => attachGenre(store, rg))
}

function pressingsForRelease(store: Store, releaseId: number) {
  return [...store.pressings.values()]
    .filter((p) => p.releaseId === releaseId)
    .sort((a, b) => (a.pressingYear ?? 0) - (b.pressingYear ?? 0))
    .map((p) => ({ ...p, format: getFormatOrThrow(store, p.formatId) }))
}

function getFormatOrThrow(store: Store, formatId: number): FormatRow {
  const format = store.formats.get(formatId)
  if (!format) throw new Error(`fakePrismaClient: dangling formatId ${formatId}`)
  return format
}

function getReleaseOrThrow(store: Store, releaseId: number): ReleaseRow {
  const release = store.releases.get(releaseId)
  if (!release) throw new Error(`fakePrismaClient: dangling releaseId ${releaseId}`)
  return release
}

/**
 * Every call site in the app that includes `artists` or `genres` on a release always
 * nests `{ include: { artist: true }, orderBy: {...} }` / `{ include: { genre: true }, ... }`
 * — never the bare boolean `true`. A bare `true` would (correctly, in real Prisma)
 * return the join-table rows *without* the nested artist/genre, which this fake
 * doesn't implement — so it fails fast here rather than silently attaching the
 * nested object anyway, which is exactly the drift this fake's own contract test
 * caught once (see __tests__/contract/fakePrismaClient.contract.test.ts).
 */
function wantsNestedRelation(value: unknown, label: string): boolean {
  if (value === true) unsupported(`${label}: true (bare boolean) — only the nested { include: {...} } form is supported`)
  return !!value
}

/** include: { artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } } } and/or genres, in the shape every page in the app uses. */
function expandRelease(
  store: Store,
  release: ReleaseRow,
  include: { artists?: unknown; genres?: unknown; pressings?: boolean } = {}
) {
  return {
    ...release,
    ...(wantsNestedRelation(include.artists, 'release.artists') && { artists: releaseArtistsFor(store, release.releaseId) }),
    ...(wantsNestedRelation(include.genres, 'release.genres') && { genres: releaseGenresFor(store, release.releaseId) }),
    ...(include.pressings && { pressings: pressingsForRelease(store, release.releaseId) }),
  }
}

function textContainsInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

// ---- model surface -----------------------------------------------------------------

type ArtistInclude = { releases?: { include?: unknown; orderBy?: unknown } }
type ReleaseInclude = { artists?: boolean | { include?: { artist?: boolean }; orderBy?: unknown }; genres?: boolean | { include?: { genre?: boolean }; orderBy?: unknown } }
type PressingInclude = { format?: boolean; release?: boolean | { include?: ReleaseInclude } }

function buildArtistModel(store: Store) {
  return {
    async create({ data }: { data: { name: string; sortName: string } }) {
      const artistId = nextId(store, 'artist')
      const row: ArtistRow = { artistId, name: data.name, sortName: data.sortName, createdAt: new Date() }
      store.artists.set(artistId, row)
      return { ...row }
    },

    async update({ where, data }: { where: { artistId: number }; data: Partial<Pick<ArtistRow, 'name' | 'sortName'>> }) {
      const existing = store.artists.get(where.artistId)
      if (!existing) throw new Error(`fakePrismaClient: artist ${where.artistId} not found`)
      const updated = { ...existing, ...data }
      store.artists.set(where.artistId, updated)
      return { ...updated }
    },

    async findMany(args: { where?: { name?: { contains: string; mode?: string } }; orderBy?: { sortName?: 'asc' | 'desc' }; take?: number } = {}) {
      let rows = [...store.artists.values()]
      if (args.where?.name?.contains) {
        const needle = args.where.name.contains
        rows = rows.filter((a) => textContainsInsensitive(a.name, needle))
      }
      if (args.orderBy?.sortName) {
        const dir = args.orderBy.sortName === 'desc' ? -1 : 1
        rows = [...rows].sort((a, b) => dir * a.sortName.localeCompare(b.sortName))
      }
      if (args.take != null) rows = rows.slice(0, args.take)
      return rows.map((r) => ({ ...r }))
    },

    async findUnique({ where, include }: { where: { artistId: number }; include?: ArtistInclude }) {
      const artist = store.artists.get(where.artistId)
      if (!artist) return null
      if (!include?.releases) return { ...artist }

      const releases = store.releaseArtists
        .filter((ra) => ra.artistId === where.artistId)
        .map((ra) => {
          const release = getReleaseOrThrow(store, ra.releaseId)
          return { ...ra, release: expandRelease(store, release, { artists: true, genres: true, pressings: true }) }
        })
        .sort((a, b) => a.release.originalReleaseYear - b.release.originalReleaseYear)

      return { ...artist, releases }
    },
  }
}

function buildFormatModel(store: Store) {
  return {
    async create({ data }: { data: { name: string; description?: string | null } }) {
      const formatId = nextId(store, 'format')
      const row: FormatRow = { formatId, name: data.name, description: data.description ?? null }
      store.formats.set(formatId, row)
      return { ...row }
    },
    async findMany(args: { orderBy?: { name?: 'asc' | 'desc' } } = {}) {
      let rows = [...store.formats.values()]
      if (args.orderBy?.name) {
        const dir = args.orderBy.name === 'desc' ? -1 : 1
        rows = [...rows].sort((a, b) => dir * a.name.localeCompare(b.name))
      }
      return rows.map((r) => ({ ...r }))
    },
  }
}

function buildGenreModel(store: Store) {
  return {
    async create({ data }: { data: { name: string } }) {
      const genreId = nextId(store, 'genre')
      const row: GenreRow = { genreId, name: data.name }
      store.genres.set(genreId, row)
      return { ...row }
    },
    async findMany(args: { orderBy?: { name?: 'asc' | 'desc' } } = {}) {
      let rows = [...store.genres.values()]
      if (args.orderBy?.name) {
        const dir = args.orderBy.name === 'desc' ? -1 : 1
        rows = [...rows].sort((a, b) => dir * a.name.localeCompare(b.name))
      }
      return rows.map((r) => ({ ...r }))
    },
  }
}

function buildReleaseModel(store: Store) {
  return {
    async create({
      data,
    }: {
      data: {
        title: string
        originalReleaseYear: number
        coverImageUrl?: string | null
        notes?: string | null
        artists: { create: Array<{ artistId: number; artistOrder: number }> }
        genres?: { create: Array<{ genreId: number; genreOrder: number }> }
      }
    }) {
      const releaseId = nextId(store, 'release')
      const now = new Date()
      const row: ReleaseRow = {
        releaseId,
        title: data.title,
        originalReleaseYear: data.originalReleaseYear,
        notes: data.notes ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        createdAt: now,
        updatedAt: now,
      }
      store.releases.set(releaseId, row)
      for (const a of data.artists.create) {
        store.releaseArtists.push({ releaseId, artistId: a.artistId, artistOrder: a.artistOrder, role: 'Primary Artist' })
      }
      for (const g of data.genres?.create ?? []) {
        store.releaseGenres.push({ releaseId, genreId: g.genreId, genreOrder: g.genreOrder })
      }
      return { ...row }
    },

    async update({
      where,
      data,
    }: {
      where: { releaseId: number }
      data: Partial<Pick<ReleaseRow, 'title' | 'originalReleaseYear' | 'notes' | 'coverImageUrl'>>
    }) {
      const existing = getReleaseOrThrow(store, where.releaseId)
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.releases.set(where.releaseId, updated)
      return { ...updated }
    },

    async findUnique({ where, include }: { where: { releaseId: number }; include?: ReleaseInclude }) {
      const release = store.releases.get(where.releaseId)
      if (!release) return null
      return expandRelease(store, release, { artists: include?.artists, genres: include?.genres })
    },

    async findMany(args: {
      where?: { title?: { contains: string; mode?: string } }
      include?: ReleaseInclude
      orderBy?: { title?: 'asc' | 'desc' }
      take?: number
    } = {}) {
      let rows = [...store.releases.values()]
      if (args.where?.title?.contains) {
        const needle = args.where.title.contains
        rows = rows.filter((r) => textContainsInsensitive(r.title, needle))
      }
      if (args.orderBy?.title) {
        const dir = args.orderBy.title === 'desc' ? -1 : 1
        rows = [...rows].sort((a, b) => dir * a.title.localeCompare(b.title))
      }
      if (args.take != null) rows = rows.slice(0, args.take)
      return rows.map((r) => expandRelease(store, r, { artists: args.include?.artists, genres: args.include?.genres }))
    },
  }
}

type PressingWhere = {
  pressingId?: number
  formatId?: number
  release?: {
    artists?: { some: { artistId: number } }
    genres?: { some: { genreId: number } }
  }
}

function pressingMatches(store: Store, p: PressingRow, where?: PressingWhere): boolean {
  if (!where) return true
  if (where.formatId != null && p.formatId !== where.formatId) return false
  if (where.release?.artists?.some.artistId != null) {
    const artistId = where.release.artists.some.artistId
    const hasArtist = store.releaseArtists.some((ra) => ra.releaseId === p.releaseId && ra.artistId === artistId)
    if (!hasArtist) return false
  }
  if (where.release?.genres?.some.genreId != null) {
    const genreId = where.release.genres.some.genreId
    const hasGenre = store.releaseGenres.some((rg) => rg.releaseId === p.releaseId && rg.genreId === genreId)
    if (!hasGenre) return false
  }
  return true
}

function buildPressingModel(store: Store) {
  return {
    async create({ data }: { data: Omit<PressingRow, 'pressingId' | 'createdAt' | 'updatedAt'> }) {
      const pressingId = nextId(store, 'pressing')
      const now = new Date()
      const row: PressingRow = { pressingId, createdAt: now, updatedAt: now, ...data }
      store.pressings.set(pressingId, row)
      return { ...row }
    },

    async update({ where, data }: { where: { pressingId: number }; data: Partial<PressingRow> }) {
      const existing = store.pressings.get(where.pressingId)
      if (!existing) throw new Error(`fakePrismaClient: pressing ${where.pressingId} not found`)
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.pressings.set(where.pressingId, updated)
      return { ...updated }
    },

    async delete({ where }: { where: { pressingId: number } }) {
      const existing = store.pressings.get(where.pressingId)
      if (!existing) throw new Error(`fakePrismaClient: pressing ${where.pressingId} not found`)
      store.pressings.delete(where.pressingId)
      return { ...existing }
    },

    async findUnique({ where, include }: { where: { pressingId: number }; include?: PressingInclude }) {
      const pressing = store.pressings.get(where.pressingId)
      if (!pressing) return null
      return expandPressing(store, pressing, include)
    },

    async findMany(args: { where?: PressingWhere; include?: PressingInclude; orderBy?: unknown } = {}) {
      const rows = [...store.pressings.values()].filter((p) => pressingMatches(store, p, args.where))
      return rows.map((p) => expandPressing(store, p, args.include))
    },
  }
}

function expandPressing(store: Store, pressing: PressingRow, include?: PressingInclude) {
  const releaseInclude = typeof include?.release === 'object' ? include.release.include : undefined
  return {
    ...pressing,
    ...(include?.format && { format: getFormatOrThrow(store, pressing.formatId) }),
    ...(include?.release && {
      release: expandRelease(store, getReleaseOrThrow(store, pressing.releaseId), {
        artists: releaseInclude?.artists,
        genres: releaseInclude?.genres,
      }),
    }),
  }
}

function buildWishlistItemModel(store: Store) {
  return {
    async create({ data }: { data: Omit<WishlistItemRow, 'wishlistItemId' | 'createdAt' | 'updatedAt'> }) {
      const wishlistItemId = nextId(store, 'wishlistItem')
      const now = new Date()
      const row: WishlistItemRow = { wishlistItemId, createdAt: now, updatedAt: now, ...data }
      store.wishlistItems.set(wishlistItemId, row)
      return { ...row }
    },

    async update({ where, data }: { where: { wishlistItemId: number }; data: Partial<WishlistItemRow> }) {
      const existing = store.wishlistItems.get(where.wishlistItemId)
      if (!existing) throw new Error(`fakePrismaClient: wishlistItem ${where.wishlistItemId} not found`)
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.wishlistItems.set(where.wishlistItemId, updated)
      return { ...updated }
    },

    async delete({ where }: { where: { wishlistItemId: number } }) {
      const existing = store.wishlistItems.get(where.wishlistItemId)
      if (!existing) throw new Error(`fakePrismaClient: wishlistItem ${where.wishlistItemId} not found`)
      store.wishlistItems.delete(where.wishlistItemId)
      return { ...existing }
    },

    async findUnique({ where, include }: { where: { wishlistItemId: number }; include?: PressingInclude }) {
      const item = store.wishlistItems.get(where.wishlistItemId)
      if (!item) return null
      return expandWishlistItem(store, item, include)
    },

    async findMany(args: { include?: PressingInclude } = {}) {
      return [...store.wishlistItems.values()].map((item) => expandWishlistItem(store, item, args.include))
    },
  }
}

function expandWishlistItem(store: Store, item: WishlistItemRow, include?: PressingInclude) {
  const releaseInclude = typeof include?.release === 'object' ? include.release.include : undefined
  return {
    ...item,
    ...(include?.format && { format: getFormatOrThrow(store, item.formatId) }),
    ...(include?.release && {
      release: expandRelease(store, getReleaseOrThrow(store, item.releaseId), {
        artists: releaseInclude?.artists,
        genres: releaseInclude?.genres,
      }),
    }),
  }
}

function buildReleaseGenreModel(store: Store) {
  return {
    async deleteMany({ where }: { where: { releaseId: number } }) {
      const before = store.releaseGenres.length
      store.releaseGenres = store.releaseGenres.filter((rg) => rg.releaseId !== where.releaseId)
      return { count: before - store.releaseGenres.length }
    },
    async createMany({ data }: { data: Array<{ releaseId: number; genreId: number; genreOrder: number }> }) {
      store.releaseGenres.push(...data)
      return { count: data.length }
    },
  }
}

type TxClient = {
  artist: ReturnType<typeof buildArtistModel>
  format: ReturnType<typeof buildFormatModel>
  genre: ReturnType<typeof buildGenreModel>
  release: ReturnType<typeof buildReleaseModel>
  pressing: ReturnType<typeof buildPressingModel>
  wishlistItem: ReturnType<typeof buildWishlistItemModel>
  releaseGenre: ReturnType<typeof buildReleaseGenreModel>
}

export type FakePrismaClient = ReturnType<typeof createFakePrismaClient>

/** Creates a fresh, empty fake Prisma client — one per test, never shared. */
export function createFakePrismaClient() {
  const store = emptyStore()

  const client: TxClient & {
    $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>
    $queryRaw: () => Promise<never>
  } = {
    artist: buildArtistModel(store),
    format: buildFormatModel(store),
    genre: buildGenreModel(store),
    release: buildReleaseModel(store),
    pressing: buildPressingModel(store),
    wishlistItem: buildWishlistItemModel(store),
    releaseGenre: buildReleaseGenreModel(store),

    async $transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
      // Best-effort atomicity: snapshot the store, restore it if the callback throws.
      // Not real MVCC — see the module doc comment for what this fake does and doesn't model.
      const snapshot = {
        artists: new Map(store.artists),
        genres: new Map(store.genres),
        formats: new Map(store.formats),
        releases: new Map(store.releases),
        releaseArtists: [...store.releaseArtists],
        releaseGenres: [...store.releaseGenres],
        pressings: new Map(store.pressings),
        wishlistItems: new Map(store.wishlistItems),
        nextId: { ...store.nextId },
      }
      try {
        return await fn(client)
      } catch (err) {
        Object.assign(store, snapshot)
        throw err
      }
    },

    async $queryRaw() {
      return unsupported('$queryRaw')
    },
  }

  return client
}
