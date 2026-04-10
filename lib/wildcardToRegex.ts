/**
 * Converts a wildcard pattern (* ?) into a PostgreSQL regex string.
 * Other regex metacharacters are escaped so they are treated as literals.
 *
 *   *  →  .* (any sequence of characters)
 *   ?  →  .  (any single character)
 */
export function wildcardToRegex(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
    .replace(/\*/g, '.*')                   // * → any sequence
    .replace(/\?/g, '.')                    // ? → any single char
}
