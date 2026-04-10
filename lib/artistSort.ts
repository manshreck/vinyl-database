const ARTICLES = /^(the|a|an)\s+/i

/**
 * Returns a sort key for an artist's sortName by stripping leading articles
 * (The, A, An) and lowercasing, so alphabetical ordering ignores them.
 *
 * Examples:
 *   "Beatles, The"       → "beatles, the"
 *   "A Tribe Called Quest" → "tribe called quest"
 *   "Davis, Miles"       → "davis, miles"
 */
export function artistSortKey(sortName: string): string {
  return sortName.replace(ARTICLES, '').toLowerCase()
}
