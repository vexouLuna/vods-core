import { describe, expect, it, vi } from 'vitest'
import { ProblemError } from '@vex/platform-web'
import { ArchiveClient } from '../src/api/client'

const client = (status: number, body: unknown) =>
  new ArchiveClient({ apiBase: '', fetch: vi.fn(async () => new Response(JSON.stringify(body), { status })) })

describe('ArchiveClient errors', () => {
  it("reads the legacy routes' msg, not their error flag", async () => {
    const err = await client(500, { error: true, msg: 'Not a cursor from this API' }).commentsAfter('1', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProblemError)
    expect((err as ProblemError).message).toBe('Not a cursor from this API')
  })

  it('treats "nothing said after this offset" as an empty page', async () => {
    for (const msg of ['No chat at or after offset 18960.0', 'Failed to retrieve comments from offset 18960.0']) {
      expect(await client(500, { error: true, msg }).commentsAt('1', 18960)).toEqual({ comments: [] })
    }
    await expect(client(500, { error: true, msg: 'There is no VOD 1' }).commentsAt('1', 0)).rejects.toThrow('There is no VOD 1')
  })
})
