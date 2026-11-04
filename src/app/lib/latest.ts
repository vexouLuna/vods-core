/**
 * A request sequence for loads that can overlap (the id in the URL changes while the last fetch is in flight):
 * `const isLatest = begin()` at the start; after each `await`, a result is only used while `isLatest()` is true.
 */
export function useLatest() {
  let seq = 0
  return () => {
    const mine = ++seq
    return () => mine === seq
  }
}
