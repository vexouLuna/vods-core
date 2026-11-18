// Sending a file to the worker's chunked upload (POST/PUT /api/v2/uploads): from what it already has, one chunk at a
// time, retrying a dropped chunk and following the worker when it says it holds more (or less) than we thought.
import { ProblemError } from '@vex/platform-web'
import type { CustomUpload } from './api'
import { admin } from './session'

/** How often one chunk is tried before the upload stops (it can be resumed later from where it got to). */
export const CHUNK_TRIES = 5

export interface SendOptions {
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
  /** Waits between tries (tests pass a no-op). */
  wait?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The upload of this file, among the unfinished ones: same name and size (a reload lost the page's state). */
export const resumable = (uploads: readonly CustomUpload[], file: { name: string; size: number }) =>
  uploads.find((u) => u.filename === file.name.split(/\s+/).join(' ') && u.size_bytes === file.size) ?? null

/** Sends `file` into `up` from `up.received_bytes` to the end; resolves with the finished upload. A network error or a
 * 5xx is tried again (backing off), a 409 `offset_mismatch` moves to the offset the worker has; anything else, an abort
 * or CHUNK_TRIES failures in a row stop it, and the upload stays to be resumed. */
export async function sendFile(file: Blob, up: CustomUpload, opts: SendOptions = {}): Promise<CustomUpload> {
  const wait = opts.wait ?? sleep
  let at = up
  let failures = 0
  opts.onProgress?.(at.received_bytes, at.size_bytes)
  while (at.received_bytes < at.size_bytes) {
    opts.signal?.throwIfAborted()
    const from = at.received_bytes
    const chunk = file.slice(from, Math.min(from + at.chunk_bytes, at.size_bytes))
    try {
      at = await admin.putChunk(at.id, from, chunk, opts.signal)
      failures = 0
    } catch (e) {
      if (opts.signal?.aborted) throw e
      if (e instanceof ProblemError && e.status === 409 && typeof e.body.received_bytes === 'number') {
        at = { ...at, received_bytes: e.body.received_bytes }
        continue
      }
      const retryable = !(e instanceof ProblemError) || e.status >= 500 || e.status === 409
      if (!retryable || ++failures >= CHUNK_TRIES) throw e
      await wait(1000 * 2 ** failures)
      continue
    }
    opts.onProgress?.(at.received_bytes, at.size_bytes)
  }
  return at
}
