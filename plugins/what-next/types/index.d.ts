export type Proposal = { slug: string; name: string; note: string; isParked: boolean }
export type Issue = { number: number; title: string; body: string }
export type Row = { key: string; number: string; name: string; note: string; isParked: boolean }
export type Tab = 'proposals' | 'issues'
export type Reading = { name: string; text: string; opener: string }

declare module 'claude-code' {
  interface PluginState {
    'what-next': {
      list: Proposal[] | null
      issues: Issue[] | null
      tab: Tab
      assigned: number | null
      reading: Reading | null
      typed: string
    }
  }
}
