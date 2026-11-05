export type Attached = { n: number; file?: string; width?: number; height?: number }

declare module 'claude-code' {
  interface PluginState {
    'image-thumbnail': {
      images: Attached[]
    }
  }
}
