// Relative times ("5 min ago"), worded as vex-ui words them. Here so the app needs no vex-ui component entry.

const span = (s: number): string => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`)

/** "12s ago", "5 min ago", "3 h ago" (or "in 5 min"), then the date. Takes an ISO string or epoch ms; empty → "—". */
export function timeAgo(when: string | number | null | undefined, now = Date.now()): string {
  if (!when) return '—'
  const t = typeof when === 'number' ? when : Date.parse(when)
  if (Number.isNaN(t)) return '—'
  const s = Math.round((now - t) / 1000)
  if (s < 0) return `in ${span(-s)}`
  if (s < 86400) return `${span(s)} ago`
  return new Date(t).toISOString().slice(0, 10)
}
