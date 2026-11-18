import { describe, expect, it, vi } from 'vitest'
import type { CustomUpload } from '../../src/app/admin/api'
import { admin } from '../../src/app/admin/session'
import { CHUNK_TRIES, resumable, sendFile } from '../../src/app/admin/upload'

const UP: CustomUpload = {
  id: 'upload-0123456789ab', filename: 'clip.mp4', size_bytes: 10, received_bytes: 0, chunk_bytes: 4,
  created_at: '2026-11-17T10:00:00Z', updated_at: '2026-11-17T10:00:00Z', created_by: null,
}
const problem = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ status, ...body }), { status, headers: { 'content-type': 'application/problem+json' } })

/** A worker that holds `held` bytes and answers each PUT as the real one does (an offset it doesn't have: 409). */
function worker(held: number, fail: (call: number) => Response | Error | null = () => null) {
  const puts: [number, number][] = []
  let call = 0
  vi.spyOn(admin as unknown as { fetcher: (u: string, i?: RequestInit) => Promise<Response> }, 'fetcher').mockImplementation(async (url, init) => {
    const offset = Number(new URL(url, 'http://x').searchParams.get('offset'))
    const size = (init!.body as Blob).size
    const broken = fail(call++)
    if (broken instanceof Error) throw broken
    if (broken) return broken
    if (offset !== held) return problem(409, { code: 'offset_mismatch', received_bytes: held })
    puts.push([offset, size])
    held += size
    return new Response(JSON.stringify({ ...UP, received_bytes: held }), { status: 200 })
  })
  return puts
}

describe('sending a file in chunks', () => {
  const file = new Blob(['0123456789'])

  it('sends from what the worker has, follows it when it holds more, and reports progress', async () => {
    const puts = worker(4)
    const seen: number[] = []
    const done = await sendFile(file, { ...UP, received_bytes: 0 }, { onProgress: (n) => seen.push(n) })
    expect(done.received_bytes).toBe(10)
    expect(puts).toEqual([[4, 4], [8, 2]]) // the 0 offset was refused with "it has 4": no byte sent twice
    expect(seen).toEqual([0, 8, 10])
    vi.restoreAllMocks()
  })

  it('tries a dropped chunk again, and gives up after CHUNK_TRIES in a row', async () => {
    const puts = worker(0, (n) => (n === 1 || n === 2 ? new TypeError('network') : null))
    const wait = vi.fn(async () => {})
    await sendFile(file, UP, { wait })
    expect(puts).toEqual([[0, 4], [4, 4], [8, 2]])
    expect(wait).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()

    worker(0, () => problem(502, { code: 'bad_gateway' }))
    await expect(sendFile(file, UP, { wait })).rejects.toMatchObject({ status: 502 })
    expect(wait).toHaveBeenCalledTimes(2 + CHUNK_TRIES - 1)
    vi.restoreAllMocks()

    worker(0, () => problem(413, { code: 'chunk_too_large' }))
    await expect(sendFile(file, UP, { wait })).rejects.toMatchObject({ status: 413 }) // not worth another try
    vi.restoreAllMocks()
  })

  it('stops when paused', async () => {
    worker(0)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(sendFile(file, UP, { signal: ctrl.signal })).rejects.toThrow()
    vi.restoreAllMocks()
  })

  it('finds the upload a reload lost by name and size', () => {
    expect(resumable([UP], { name: 'clip.mp4', size: 10 })).toBe(UP)
    expect(resumable([UP], { name: 'clip.mp4', size: 11 })).toBeNull()
  })
})
