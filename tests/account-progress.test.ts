import { describe, expect, it } from 'vitest'
import { AccountProgressStore, MERGE_BATCH, type AccountLink } from '../src/accountProgress'
import { LocalProgressStore, type KeyValueStorage, type Progress } from '../src/progress'

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

/** vex-auth's /v2/progress, in memory: snake_case, ISO timestamps, paged newest first, newest winning per VOD. */
class FakeService implements AccountLink {
  signed = true
  down = false
  pageMax = 500
  entries = new Map<string, Progress>()
  calls: string[] = []

  signedIn() {
    return this.signed
  }

  private keep(p: Progress) {
    const old = this.entries.get(p.vodId)
    if (!old || p.updatedAt >= old.updatedAt) this.entries.set(p.vodId, p)
  }

  private wire(p: Progress) {
    return { vod_id: p.vodId, position_seconds: p.t, duration_seconds: p.duration, updated_at: new Date(p.updatedAt).toISOString() }
  }

  private read(vodId: string, b: Record<string, unknown>): Progress {
    return { vodId, t: Number(b.position_seconds), duration: Number(b.duration_seconds), updatedAt: Date.parse(String(b.updated_at)) }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? 'GET'
    this.calls.push(`${method} ${path}`)
    if (this.down) throw new TypeError('offline')
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    const sorted = () => [...this.entries.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    if (path === '/v2/progress/merge') {
      for (const i of JSON.parse(String(init.body)).items) this.keep(this.read(i.vod_id, i))
      return new Response(null, { status: 204 })
    }
    const list = path.match(/^\/v2\/progress(?:\?limit=(\d+))?(?:&cursor=(\d+))?$/)
    if (list) {
      const from = Number(list[2] ?? 0)
      const size = Math.min(Number(list[1] ?? 50), this.pageMax)
      const items = sorted().slice(from, from + size).map((p) => this.wire(p))
      return json({ items, next_cursor: from + size < this.entries.size ? String(from + size) : null })
    }
    const id = decodeURIComponent(path.replace('/v2/progress/', ''))
    if (method === 'PUT') {
      this.keep(this.read(id, JSON.parse(String(init.body))))
      return json(this.wire(this.entries.get(id)!))
    }
    if (method === 'DELETE') {
      this.entries.delete(id)
      return new Response(null, { status: 204 })
    }
    const p = this.entries.get(id)
    return p ? json(this.wire(p)) : new Response(null, { status: 204 })
  }
}

function setup() {
  const service = new FakeService()
  const local = new LocalProgressStore({ storage: memoryStorage() })
  return { service, local, store: new AccountProgressStore(service, { local }) }
}

describe('AccountProgressStore', () => {
  it('uses the browser while signed out', async () => {
    const { service, local, store } = setup()
    service.signed = false
    expect(await store.set({ vodId: 'a', t: 100, duration: 1000, updatedAt: 1 })).toBe('local')
    expect(await local.get('a')).toMatchObject({ t: 100 })
    expect(await store.get('a')).toMatchObject({ t: 100 })
    expect(service.calls).toEqual([])
  })

  it('keeps progress with the account while signed in', async () => {
    const { service, local, store } = setup()
    expect(await store.set({ vodId: 'v:1', t: 100.7, duration: 1000.2, updatedAt: 5 })).toBe('saved')
    expect(service.calls).toEqual(['PUT /v2/progress/v%3A1'])
    expect(service.entries.get('v:1')).toEqual({ vodId: 'v:1', t: 100, duration: 1000, updatedAt: 5 })
    expect(await store.get('v:1')).toEqual({ vodId: 'v:1', t: 100, duration: 1000, updatedAt: 5 })
    expect(await store.get('nope')).toBeNull()
    expect(await local.list()).toEqual([])
    expect(await store.list(1)).toHaveLength(1)
  })

  it('keeps finished VODs and drops restarted ones', async () => {
    const { service, store } = setup()
    await store.set({ vodId: 'a', t: 100, duration: 1000 })
    await store.set({ vodId: 'a', t: 980, duration: 1000 })
    expect(service.entries.get('a')).toMatchObject({ t: 980, duration: 1000 })
    await store.set({ vodId: 'b', t: 100, duration: 1000 })
    expect(await store.set({ vodId: 'b', t: 5, duration: 1000 })).toBe('saved')
    expect(service.entries.has('b')).toBe(false)
  })

  it('keeps a save locally when the service is down, and merges it later', async () => {
    const { service, local, store } = setup()
    service.down = true
    expect(await store.set({ vodId: 'a', t: 100, duration: 1000, updatedAt: 7 })).toBe('local')
    expect(await local.get('a')).toMatchObject({ t: 100 })
    expect(await store.get('a')).toMatchObject({ t: 100 })
    service.down = false
    expect(await store.merge()).toBe(1)
    expect(service.entries.get('a')).toMatchObject({ t: 100, updatedAt: 7 })
    expect(await local.list()).toEqual([])
  })

  it('merges local entries on sign-in, newest winning, in batches', async () => {
    const { service, local, store } = setup()
    service.entries.set('a', { vodId: 'a', t: 500, duration: 1000, updatedAt: 10 })
    await local.set({ vodId: 'a', t: 200, duration: 1000, updatedAt: 5 }) // older than the account's
    await local.set({ vodId: 'b', t: 300, duration: 1000, updatedAt: 20 })
    expect(await store.merge()).toBe(2)
    expect(service.entries.get('a')?.t).toBe(500)
    expect(service.entries.get('b')?.t).toBe(300)
    expect(await local.list()).toEqual([])

    const many = new LocalProgressStore({ storage: memoryStorage(), max: MERGE_BATCH + 10 })
    for (let i = 0; i < MERGE_BATCH + 10; i++) await many.set({ vodId: `v${i}`, t: 100, duration: 1000, updatedAt: i })
    service.calls = []
    expect(await new AccountProgressStore(service, { local: many }).merge()).toBe(MERGE_BATCH + 10)
    expect(service.calls).toEqual(['POST /v2/progress/merge', 'POST /v2/progress/merge'])
  })

  it('follows next_cursor to the last page', async () => {
    const { service, store } = setup()
    service.pageMax = 2
    for (let i = 1; i <= 5; i++) service.entries.set(`v${i}`, { vodId: `v${i}`, t: 100, duration: 1000, updatedAt: i })
    expect((await store.list()).map((p) => p.vodId)).toEqual(['v5', 'v4', 'v3', 'v2', 'v1'])
    expect(service.calls).toEqual(['GET /v2/progress?limit=500', 'GET /v2/progress?limit=500&cursor=2', 'GET /v2/progress?limit=500&cursor=4'])
    expect(await store.list(3)).toHaveLength(3)
  })

  it('merges nothing while signed out or when the service refuses', async () => {
    const { service, local, store } = setup()
    await local.set({ vodId: 'a', t: 100, duration: 1000 })
    service.signed = false
    expect(await store.merge()).toBe(0)
    service.signed = true
    service.down = true
    expect(await store.merge()).toBe(0)
    expect(await local.list()).toHaveLength(1)
  })
})
