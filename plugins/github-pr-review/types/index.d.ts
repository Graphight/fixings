export type Pr = { number: number; title: string; url: string }

export type Check = { name: string; bucket: string }

export type ReviewLine =
  | { kind: 'pr'; number: number; title: string; url: string; head: string }
  | { kind: 'step'; name: string }
  | { kind: 'finding'; id: number; tier: string; path: string; line: number; claim: string }
  | { kind: 'verdict'; id: number; kept: boolean; why: string }
  | { kind: 'mutant'; test: string; result: string }
  | { kind: 'done'; verdict: string }

export type Agent = { step: string; id: string | null; isBack: boolean }

declare module 'claude-code' {
  interface PluginState {
    'github-pr-review': {
      repo: string
      pr: Pr | null
      checks: Check[] | null
      notified: string[]
      followed: string | null
      review: ReviewLine[]
      stamps: number[]
      fleet: Agent[]
      expanded: number | null
    }
  }
}
