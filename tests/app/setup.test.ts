// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, adminBase } from '../../src/app/admin/session'
import { tagConfig } from '../../src/app/lib/vodTags'
import { setupVodsSite } from '../../src/app/setup'
import { site, vodsConfig } from '../../src/app/site'
import { defineVodsConfig } from '../../src/index'

afterEach(() => vi.unstubAllGlobals())

describe('setupVodsSite', () => {
  it('sets up the site, the admin client and the tags', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const config = defineVodsConfig({ channel: 'keeki_dechu', twitchId: '90528258', apiBase: '/api', startDate: '2025-01-01' })
    const tags = { new: { label: 'fresh', drawn: false } }
    setupVodsSite({ config, site: { id: 'keekivods', name: 'keekivods.vexoul.net', twitchUrl: 'https://twitch.tv/keeki_dechu', tags }, adminBase: '/admin-api' })

    expect(site).toMatchObject({ id: 'keekivods', name: 'keekivods.vexoul.net', perPage: 24 })
    expect(tagConfig.value).toBe(tags)
    expect(vodsConfig).toBe(config)
    expect(adminBase).toBe('/admin-api')
    expect(admin.base).toBe('/admin-api')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/site/tags', expect.anything()))
  })
})
