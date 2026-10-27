import { describe, expect, it, vi } from 'vitest'
import { ProblemError } from '@vex/platform-web'
import { AdminClient, followedGames } from '../../src/app/admin/api'

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers }),
  )
}

describe('AdminClient', () => {
  it('sends CSRF only on changes, and builds query strings without empty filters', async () => {
    const fetch = fakeFetch(200, { items: [], next_cursor: null })
    const c = new AdminClient({ base: '/backend-admin/', fetch })
    c.csrf = 'tok'
    await c.vodList({ q: '', hidden: undefined, cursor: '40' })
    await c.saveChat('7')
    const [url1, init1] = fetch.mock.calls[0]!
    expect(url1).toBe('/backend-admin/api/v2/vods?cursor=40')
    expect((init1!.headers as Record<string, string>)['x-csrf-token']).toBeUndefined()
    const [url2, init2] = fetch.mock.calls[1]!
    expect(url2).toBe('/backend-admin/admin/logs')
    expect(init2!.method).toBe('POST')
    expect((init2!.headers as Record<string, string>)['x-csrf-token']).toBe('tok')
  })

  it('lists the channel VODs on Twitch and imports them paused', async () => {
    const video = { id: '9', title: 't', createdAt: 'x', duration: '01:00:00', thumbnailUrl: null, inArchive: false, uploaded: false, archiveJob: null }
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(url.endsWith('/videos') ? { data: [video] } : { error: false, msg: 'ok', added: [{ vodId: '9', jobId: 1 }], skipped: [] }), { status: 200 }),
    )
    const c = new AdminClient({ base: '', fetch })
    expect(await c.twitchVideos()).toEqual([video])
    expect((await c.importFromTwitch(['9'])).added).toEqual([{ vodId: '9', jobId: 1 }])
    await c.importFromTwitch(['9'], false)
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/admin/twitch/videos', 'GET', null],
      ['/admin/twitch/import', 'POST', JSON.stringify({ vodIds: ['9'], paused: true })],
      ['/admin/twitch/import', 'POST', JSON.stringify({ vodIds: ['9'], paused: false })],
    ])
  })

  it('lists VODs and edits synthetic ones through /api/v2', async () => {
    const fetch = fakeFetch(200, { items: [], next_cursor: null })
    const c = new AdminClient({ base: '', fetch })
    await c.vodList({ q: '', synthetic: true, cursor: 'abc', limit: 30 })
    await c.createSynthetic({ id: 'elden-ring', tags: ['compilation'], segments: [{ vod_id: '1', start: 5 }] })
    await c.updateSynthetic('elden ring', { title: 'x' })
    await c.playthroughCandidates('512953')
    await c.playthroughCandidates(['512953', '21779'])
    await c.syntheticDmca('elden ring')
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/api/v2/vods?synthetic=true&cursor=abc&limit=30', 'GET', null],
      ['/api/v2/synthetic', 'POST', JSON.stringify({ id: 'elden-ring', tags: ['compilation'], segments: [{ vod_id: '1', start: 5 }] })],
      ['/api/v2/synthetic/elden%20ring', 'PUT', JSON.stringify({ title: 'x' })],
      ['/api/v2/playthrough-candidates?game_id=512953', 'GET', null],
      ['/api/v2/playthrough-candidates?game_id=512953&game_id=21779', 'GET', null],
      ['/api/v2/synthetic/elden%20ring/dmca', 'GET', null],
    ])
  })

  it('starts bot chat for one VOD, and backfills all or only some', async () => {
    const fetch = fakeFetch(200, { error: false, msg: 'ok', jobId: 3 })
    const c = new AdminClient({ base: '', fetch })
    await c.botChat('123')
    await c.botChatBackfill()
    await c.botChatBackfill(['1', '2'])
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body])
    expect(sent).toEqual([
      ['/admin/bot-chat', 'POST', JSON.stringify({ vodId: '123' })],
      ['/admin/bot-chat/backfill', 'POST', JSON.stringify({})],
      ['/admin/bot-chat/backfill', 'POST', JSON.stringify({ vodIds: ['1', '2'] })],
    ])
  })

  it('turns worker errors into ProblemError with the message and Retry-After', async () => {
    const c = new AdminClient({ base: '', fetch: fakeFetch(429, { error: true, msg: 'Too many attempts' }, { 'retry-after': '120' }) })
    const err = await c.login('x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProblemError)
    expect(err).toMatchObject({ status: 429, message: 'Too many attempts', retryAfter: 120 })
  })

  it('reports an expired session, but not a failed login', async () => {
    const c = new AdminClient({ base: '', fetch: fakeFetch(401, { error: true, msg: 'Not logged in' }) })
    const expired = vi.fn()
    c.onUnauthorized = expired
    await c.login('wrong').catch(() => {})
    expect(expired).not.toHaveBeenCalled()
    await c.health().catch(() => {})
    expect(expired).toHaveBeenCalledOnce()
  })

  it('handles 204 and non-JSON error bodies', async () => {
    const ok = new AdminClient({ base: '', fetch: vi.fn(async () => new Response(null, { status: 204 })) })
    await expect(ok.logout()).resolves.toBeUndefined()
    const bad = new AdminClient({ base: '', fetch: vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })) })
    await expect(bad.health()).rejects.toMatchObject({ status: 502, message: 'HTTP 502' })
  })
})

describe('AdminClient: VODs, settings and storage', () => {
  it('lists VODs with only the filters given, and and patches', async () => {
    const fetch = fakeFetch(200, { items: [], next_cursor: null })
    const c = new AdminClient({ base: '', fetch })
    await c.vodList({ q: 'doom', hidden: false, limit: 30, cursor: undefined })
    await c.vodList({ hidden: true })
    await c.updateVod('12', { hidden: true, thumbnailUrl: null })
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/api/v2/vods?q=doom&hidden=false&limit=30', 'GET', null],
      ['/api/v2/vods?hidden=true', 'GET', null],
      ['/api/v2/vods/12', 'PATCH', JSON.stringify({ hidden: true, thumbnail_url: null })],
      ['/admin/vods/12', 'GET', null],
    ])
  })

  it('sends the VOD actions to /api/v2 and answers in the shapes the editors take', async () => {
    const answers: Record<string, unknown> = {
      '/api/v2/vods/12/youtube/delete': { deleted: ['a'], failed: [{ id: 'b', error: 'no' }], describe_jobs: [7], vod: {} },
      '/api/v2/vods/12/rearchive': { job_id: 9, message: 'Re-archiving 12' },
      '/api/v2/vods/12/emotes': { vod_id: '12', ffz_emotes: [], updated_at: '2026-10-01T00:00:00Z' },
      '/api/v2/jobs/5/censor-review': { job_id: 5, message: 'Job 5 resumed' },
    }
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(answers[String(url)] ?? { id: '12' }), { status: 200 }))
    const c = new AdminClient({ base: '', fetch })
    expect(await c.deleteUploads('12', ['a', 'b'])).toEqual({
      error: false, msg: 'Deleted 1 upload(s) from YouTube, 1 failed', deleted: ['a'], failed: [{ id: 'b', error: 'no' }], describeJobs: [7], vod: { id: '12' },
    })
    expect(await c.rearchive('12', { part: 2 })).toEqual({ error: false, msg: 'Re-archiving 12', jobId: 9 })
    expect((await c.vodEmotes('12'))?.updated_at).toBe('2026-10-01T00:00:00Z')
    expect((await c.censorReview(5, 'cut')).message).toBe('Job 5 resumed')
    await c.updateVod('12', { title: 't', createdAt: '2026-10-01T00:00:00Z', cutReason: null })
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/api/v2/vods/12/youtube/delete', 'POST', JSON.stringify({ videos: ['a', 'b'] })],
      ['/admin/vods/12', 'GET', null],
      ['/api/v2/vods/12/rearchive', 'POST', JSON.stringify({ part: 2 })],
      ['/api/v2/vods/12/emotes', 'GET', null],
      ['/api/v2/jobs/5/censor-review', 'POST', JSON.stringify({ decision: 'cut' })],
      ['/api/v2/vods/12', 'PATCH', JSON.stringify({ title: 't', created_at: '2026-10-01T00:00:00Z', cut_reason: null })],
      ['/admin/vods/12', 'GET', null],
    ])
  })

  it('reads, saves and resets settings, and reads and deletes storage', async () => {
    const fetch = fakeFetch(200, { items: [], next_cursor: null })
    const c = new AdminClient({ base: '', fetch })
    await c.settings()
    await c.saveSettings({ runner_concurrency: 2, vod_download: false })
    await c.resetSetting('runner_concurrency')
    await c.storage()
    await c.storage(true)
    await c.deleteFolder('vods', '123')
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/api/v2/settings', 'GET', null],
      ['/api/v2/settings', 'PATCH', JSON.stringify({ runner_concurrency: 2, vod_download: false })],
      ['/api/v2/settings/runner_concurrency', 'DELETE', null],
      ['/api/v2/storage', 'GET', null],
      ['/api/v2/storage?refresh=true', 'GET', null],
      ['/api/v2/storage/vods/123', 'DELETE', null],
    ])
  })

  it('takes a problem detail as the message', async () => {
    const bad = new AdminClient({ base: '', fetch: fakeFetch(400, { type: 'about:blank', status: 400, code: 'bad_cursor', detail: 'not a cursor' }) })
    const err = await bad.vodList({ cursor: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProblemError)
    expect((err as ProblemError).message).toBe('not a cursor')
  })
})

describe('followedGames', () => {
  it('reads both shapes of auto', () => {
    expect(followedGames({ game_ids: ['1', '2'] })).toEqual(['1', '2'])
    expect(followedGames({ game_id: '1' })).toEqual(['1'])
    expect(followedGames(null)).toEqual([])
  })
})
