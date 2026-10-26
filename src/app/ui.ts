// The controls the app's pages are built from, by role. The app never imports a look: its templates use <UiButton>,
// <UiShell>… unimported, and createVodsApp() registers the site's own set under those names (`ui` option).
// `@vex/vods-core/deep-field` is the Deep Field set; keeki-vods brings its own.
import type { App, Component, DefineComponent } from 'vue'
import type {
  NavItem,
  VxAccountMenu,
  VxButton,
  VxCallout,
  VxChapterBar,
  VxCheckbox,
  VxChip,
  VxConfirm,
  VxDateInput,
  VxDateRange,
  VxDialog,
  VxEmptyState,
  VxField,
  VxInput,
  VxKbd,
  VxLink,
  VxLoadState,
  VxMenuItem,
  VxNavBar,
  VxPageHead,
  VxPlaceholder,
  VxPopover,
  VxPosters,
  VxProgress,
  VxSaveBar,
  VxSegmented,
  VxSelect,
  VxSkeleton,
  VxSlider,
  VxSpinner,
  VxStatTile,
  VxStatusDot,
  VxStepper,
  VxSwitch,
  VxTable,
  VxTabs,
  VxTextarea,
  VxTooltip,
} from '@vex/ui'

/**
 * The frame for every page: header with the brand, `nav`, the `actions` and `account` slots, the page in the default
 * slot, the footer and the toast host. In a container named `vods` (the pages' `@container vods` queries).
 */
export type UiShellComponent = DefineComponent<{ nav: NavItem[]; fill?: boolean; header?: boolean; sky?: 'full' | 'dim' | 'off' }>

// shortcut: each control is typed as its Deep Field one (keeki's K* mirror their props and slots); a site whose
// controls differ would need a contract of plain prop types here.
export interface VodsUiComponents {
  AccountMenu: typeof VxAccountMenu
  Button: typeof VxButton
  Callout: typeof VxCallout
  ChapterBar: typeof VxChapterBar
  Checkbox: typeof VxCheckbox
  Chip: typeof VxChip
  Confirm: typeof VxConfirm
  DateInput: typeof VxDateInput
  DateRange: typeof VxDateRange
  Dialog: typeof VxDialog
  EmptyState: typeof VxEmptyState
  Field: typeof VxField
  Input: typeof VxInput
  Kbd: typeof VxKbd
  Link: typeof VxLink
  LoadState: typeof VxLoadState
  MenuItem: typeof VxMenuItem
  NavBar: typeof VxNavBar
  PageHead: typeof VxPageHead
  Placeholder: typeof VxPlaceholder
  Popover: typeof VxPopover
  Posters: typeof VxPosters
  Progress: typeof VxProgress
  SaveBar: typeof VxSaveBar
  Segmented: typeof VxSegmented
  Select: typeof VxSelect
  Shell: UiShellComponent
  Skeleton: typeof VxSkeleton
  Slider: typeof VxSlider
  Spinner: typeof VxSpinner
  StatTile: typeof VxStatTile
  StatusDot: typeof VxStatusDot
  Stepper: typeof VxStepper
  Switch: typeof VxSwitch
  Table: typeof VxTable
  Tabs: typeof VxTabs
  Textarea: typeof VxTextarea
  Tooltip: typeof VxTooltip
}

/** A site's look for the app: its controls, and anything else it installs (e.g. Deep Field's build stamp). */
export interface VodsUi {
  components: { [K in keyof VodsUiComponents]: Component }
  install?(app: App, ctx: { commit: string }): void
}

type Registered = { [K in keyof VodsUiComponents as `Ui${K}`]: VodsUiComponents[K] }

declare module 'vue' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalComponents extends Registered {}
}

const KEYS: (keyof VodsUiComponents)[] = [
  'AccountMenu', 'Button', 'Callout', 'ChapterBar', 'Checkbox', 'Chip', 'Confirm', 'DateInput', 'DateRange',
  'Dialog', 'EmptyState', 'Field', 'Input', 'Kbd', 'Link', 'LoadState', 'MenuItem', 'NavBar', 'PageHead',
  'Placeholder', 'Popover', 'Posters', 'Progress', 'SaveBar', 'Segmented', 'Select', 'Shell', 'Skeleton', 'Slider',
  'Spinner', 'StatTile', 'StatusDot', 'Stepper', 'Switch', 'Table', 'Tabs', 'Textarea', 'Tooltip',
]

/** Registers the site's controls as Ui*; throws naming any that are missing (a plain-JS site skips the type check). */
export function installUi(app: App, ui: VodsUi, commit: string): void {
  const missing = KEYS.filter((k) => !ui.components[k])
  if (missing.length) throw new Error(`createVodsApp: ui is missing ${missing.join(', ')}`)
  for (const k of KEYS) app.component(`Ui${k}`, ui.components[k])
  ui.install?.(app, { commit })
}
