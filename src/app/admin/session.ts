// The admin session: one client and one session for the whole app, on vex-platform-web's useAdminSession. The router
// guard calls `ensure()` for the Manage pages, and createVodsApp() for anyone signed in to the account; any 401 from
// the API drops the session.
import { computed, reactive, readonly } from 'vue'
import { ProblemError } from '@vex/platform-web'
import { useAdminSession } from '@vex/platform-web/vue'
import { AdminClient, type Session } from './api'

/** The worker's admin API, as the browser reaches it. configureAdmin() sets it before the app mounts. */
export let adminBase = '/backend-admin'
export const admin = new AdminClient({ base: adminBase })

const core = useAdminSession<Session>({
  auth: admin,
  load: () => admin.session(),
  logout: () => admin.logout(),
  // Keeps which logins the worker offers; drops who was signed in.
  signedOut: (s) => ({ ...s, authenticated: false, csrf: null, user: null, expiresAt: null }),
  onLoadError: (e) => {
    if (!(e instanceof ProblemError)) console.warn('admin session check failed', e)
  },
})

const data = core.data
export const session = readonly(
  reactive({
    checked: core.checked,
    authenticated: core.authenticated,
    passwordLogin: computed(() => data.value?.passwordLogin ?? true),
    twitchLogin: computed(() => data.value?.twitchLogin ?? false),
    user: computed(() => data.value?.user ?? null),
    expiresAt: computed(() => data.value?.expiresAt ?? null),
    /** Why the admin was sent to the login page (expired session). */
    notice: core.notice,
  }),
)

/**
 * Where "Sign in with Twitch" starts: the worker sends the browser through vex-auth (signing in to the site's
 * account on the way, if it wasn't) and back to `next`.
 */
export function twitchLoginUrl(next: string): string {
  return `${adminBase}/admin/signin?${new URLSearchParams({ next })}`
}

/** Why a Twitch sign-in came back to the login page (`?auth_error=` from the worker's callback). */
export const SIGNIN_ERRORS: Record<string, string> = {
  denied: 'The sign-in was cancelled on Twitch.',
  expired: 'The sign-in expired or was already used (or finished in another browser). Try again.',
  twitch: "Twitch didn't answer. Try again in a moment.",
  not_allowed: "That Twitch account isn't one of the archive's admins (ARCHIVE_ADMIN_TWITCH_IDS).",
  unavailable: "The sign-in service couldn't be reached. Try again in a moment.",
  misconfigured:
    "The sign-in service turned down the archive itself: its client ID or secret (ARCHIVE_ADMIN_AUTH_CLIENT_*) doesn't match vex-auth's. The password still works from the local network.",
}

/** Called (by createVodsApp()) with a way to go to the login page when the session expires mid-use. */
export const setExpiredHandler = core.setExpiredHandler

/** Points the admin client at the worker's admin API (`base`, e.g. `/backend-admin`). createVodsApp() calls it. */
export function configureAdmin(base: string): void {
  adminBase = base.replace(/\/+$/, '')
  admin.base = adminBase
}

/** Loads the session once (the guard awaits it on every admin navigation). */
export const ensure = core.ensure

export async function login(password: string): Promise<void> {
  core.signIn(await admin.login(password))
}

/**
 * Hands the worker a vex-auth code (admin/quiet.ts): true when the account is one of the archive's admins and the
 * dashboard session now exists, false when it isn't. Anything else throws (a ProblemError).
 */
export async function signInWithCode(code: string): Promise<boolean> {
  const s = await admin.codeSession(code)
  if (!s.admin) return false
  core.signIn(s)
  return true
}

export const logout = core.logout
