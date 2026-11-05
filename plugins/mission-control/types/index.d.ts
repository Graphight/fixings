export type Ci = { number: number; state: 'pass' | 'fail' | 'run'; failing: string[] }

export type Session = {
  sessionId: string
  id?: string
  pid?: number
  name: string
  kind: string
  status: string
  state?: string
  cwd: string
  startedAt: number
  title: string
  prompt: string
  model: string
  question: string
  mtimeMs: number
  review: string
  verdict: string
  reviewTitle: string
  stage: string
  top: string
  context?: number
  window?: number
  ci: Ci | null
  ciFlip: boolean
  running?: { tool: string; command?: string; since: number }
  permission?: { tool: string; detail: string }
  ask?: { question: string; options: string[]; index: number }
  events: { id: string; text: string; kind: string }[]
  touches: { id: string; at: number; text: string }[]
}

export type Highlight = { at: number; text: string; agent?: string; kind?: string }

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__mission-control__mission_status': {}
  }

  interface PluginState {
    'mission-control': {
      isOpen: boolean
      sessions: Session[]
      expanded: string | null
      highlights: Highlight[]
      activity: Highlight[]
      fed: string[] | null
      phases: Record<string, string> | null
      checks: Record<string, { at: number; ci: Ci | null }>
      stale: { at: number; lines: string[] }
      seen: string[] | null
      told: Record<string, string>
      tally: { at: number; commits: number; prs: number; reviews: number }
    }
  }
}
