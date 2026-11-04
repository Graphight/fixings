export type Plan = {
  title: string | null
  done: number
  total: number
  next: string | null
  stages: { title: string; isDone: boolean }[]
}

export type Times = Record<number, { start: number; finish: number | null }>

export type Activity = { tool: string; summary: string; isDone: boolean; isError: boolean }[]

export type StageRun = {
  stage: number | null
  agentId: string | null
  start: number
  durationMs: number | null
  calls: number
  edits: number
  tests: number
  errors: number
  files: string[]
  recent: Activity
}

export type RunEvent =
  | { kind: 'gate'; stage: number | null; command: string; isError: boolean; durationMs: number; at: number }
  | { kind: 'commit'; stage: number | null; sha: string | null; at: number }
  | { kind: 'push'; at: number }
  | { kind: 'pr'; url: string | null; at: number }

export type RunKind = RunEvent['kind']

export type SidecarLine =
  | { kind: 'gate'; command?: string }
  | { kind: 'stage'; n: number; outcome: 'as-planned' | 'diverged' | 'blocked'; note?: string }
  | { kind: 'halt'; stage: number; reason: string; needs: string }

export type RunSummary = {
  repo: string
  plan: string
  startedAt?: number
  endedAt: number
  outcome: 'pr' | 'halted' | 'stopped'
  totalMs: number
  stages: { n: number; durationMs: number | null; wallMs: number | null }[]
}

declare module 'claude-code' {
  interface PluginState {
    'checkpoint-plan': {
      plan: Plan | null
      followed: string | null
      shownName: string | null
      repo: string | null
      times: Times
      stages: StageRun[]
      expanded: number | null
      run: RunEvent[]
      sidecar: SidecarLine[]
      shipping: boolean
      runStart: number | null
      stopped: boolean
      notified: string[]
    }
  }
}
