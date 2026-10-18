// Sets the site up before its app mounts; createVodsApp() calls it first.
import type { VodsConfig } from '../config'
import { configureAdmin } from './admin/session'
import { configurePlatform } from './admin/platform'
import { loadTagConfig, tagConfig } from './lib/vodTags'
import { configureSite, site, type VodsSite } from './site'

export interface VodsSiteOptions {
  /** The channel and its archive API (`defineVodsConfig`). */
  config: VodsConfig
  /** The site's id, name, Twitch link, and optionally its cards per page and tags. */
  site: Partial<VodsSite> & Pick<VodsSite, 'id' | 'name' | 'twitchUrl'>
  /** The worker's admin API, for the Manage pages. Default `/backend-admin` on the same origin. */
  adminBase?: string
}

/**
 * Sets up the site before its app mounts: the site and channel, the admin API, and how tags show (the site's own
 * until /manage/tags answers).
 */
export function setupVodsSite(options: VodsSiteOptions): void {
  configureSite(options.config, options.site)
  tagConfig.value = site.tags
  configureAdmin(options.adminBase ?? '/backend-admin')
  configurePlatform()
  void loadTagConfig()
}
