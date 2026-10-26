// Moving one item of an ordered list a step up or down (the ↑ ↓ buttons on Manage's lists).

/** A copy of `list` with item `i` swapped with its neighbour `by` away; the same list when there's none. */
export function moved<T>(list: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}
