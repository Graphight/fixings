export type Evidence = { command: string; code: number | null; isMasked: boolean }

declare module 'claude-code' {
  interface PluginState {
    'evidence-band': {
      last: Evidence | null
    }
  }
}
