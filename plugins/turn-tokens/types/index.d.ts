export type Tokens = { in: number; out: number; cached: number }

declare module 'claude-code' {
  interface PluginState {
    'turn-tokens': {
      turns: Record<string, Tokens>
    }
  }
}
