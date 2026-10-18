import type { NavItem } from '@vex/ui'
import { site } from '../site'
import { tabs } from './listQuery'

/** The header's links: every list page (the VODs, then each tag with a page), then the channel. */
export function nav(): NavItem[] {
  return [...tabs().map((t) => ({ label: t.label, to: t.path })), { label: 'Live', href: site.twitchUrl, external: true }]
}
