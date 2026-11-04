export type Mark = 'pass' | 'warn' | 'fail' | 'pending' | 'skipped'

export type Check = { name: string; mark: Mark; detail: string; notes: string[] }

export type Page = { path: string; hash: number; wroteAt: number; hasWidgets: boolean; checks: Check[] }

export type Harness = { isPassed: boolean; at: number }

export type Published = { path: string; url: string; hash: number }

declare module 'claude-code' {
  interface PluginState {
    'explainer-page': {
      page: Page | null
      harness: Harness | null
      published: Published | null
    }
  }
}
