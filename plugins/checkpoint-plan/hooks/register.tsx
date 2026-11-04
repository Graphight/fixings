import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Plan, RunEvent, RunKind, RunSummary, SidecarLine, StageRun, Times } from '../types'

const plan = atom({ plugin: 'checkpoint-plan', key: 'plan' } as const, null)
const followed = atom({ plugin: 'checkpoint-plan', key: 'followed' } as const, null)
const shownName = atom({ plugin: 'checkpoint-plan', key: 'shownName' } as const, null)
const repo = atom({ plugin: 'checkpoint-plan', key: 'repo' } as const, null)
const times = atom({ plugin: 'checkpoint-plan', key: 'times' } as const, {} as Times)
const stages = atom({ plugin: 'checkpoint-plan', key: 'stages' } as const, [] as StageRun[])
const expanded = atom({ plugin: 'checkpoint-plan', key: 'expanded' } as const, null)
const run = atom({ plugin: 'checkpoint-plan', key: 'run' } as const, [] as RunEvent[])
const sidecar = atom({ plugin: 'checkpoint-plan', key: 'sidecar' } as const, [] as SidecarLine[])
const shipping = atom({ plugin: 'checkpoint-plan', key: 'shipping' } as const, false)
const stopped = atom({ plugin: 'checkpoint-plan', key: 'stopped' } as const, false)
const runStart = atom({ plugin: 'checkpoint-plan', key: 'runStart' } as const, null)
const notified = atom({ plugin: 'checkpoint-plan', key: 'notified' } as const, [] as string[])
const PANE = 'plan-timeline'
const TIMELINE = { id: PANE, title: 'Plan timeline', columns: 60 }
const STAGE = /^- \[([ x])\] (?:\d+\. )?(.+)$/gm
const SIDECAR_KINDS = new Set(['gate', 'stage', 'halt'])
const NAMED = /\/\.claude\/plans\/([\w.-]+\.md)/
const WRITERS = new Set(['Bash', 'Edit', 'Write'])
const EDITS = new Set(['Edit', 'Write'])
const EXECUTOR = 'plan-executor'
const GIT = String.raw`\bgit(?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+`
const COMMIT = new RegExp(`${GIT}commit\\b`)
const PUSH = new RegExp(`${GIT}push\\b`)
const SIDECAR_FILE = '.run.jsonl'
const PULL_REQUEST = /\bgh\s+pr\b/
const GATE = /\b(test|tests|build|validate|tsc)\b/
const SHA = /^\[[^\]\n]+? ([0-9a-f]{7,40})\]/m
const PR_URL = /https:\/\/github\.com\/\S+?\/pull\/\d+/
// the theme key warm-burnout paints burnt orange
const FILL = 'permission'
// the sub-agent calls kept under the running stage
const CALLS = 3
// the edited files listed under an open stage
const FILES = 5
// the width of a journey row's glyph and label
const LABEL_WIDTH = 12
const RUNS = 'runs'
const KEPT_RUNS = 200
const RECENT_RUNS = 5
const MIN_RUNS = 10
// measured from past ship-plan runs on 09 Oct 2026
const P50_MS = 96_000
const P90_MS = 324_000
const WALL_MS = 312_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// whether the stage rows carry their start time in a left gutter
const GUTTER = true
// `HH:MM` and two spaces
const GUTTER_WIDTH = GUTTER ? 7 : 0
// `├─ ` or `└─ `
const SPINE_WIDTH = 3
// a mark and its space
const MARK_WIDTH = 2
// the `1: ` a plain Button draws before its label
const HOTKEY_WIDTH = 3
const TIME_WIDTH = 6
const SHA_WIDTH = 7
// the sha column is dropped when it would leave the title fewer cells than this
const MIN_TITLE = 20
// `│` and the four cells that start a detail row's text under the stage number
const DETAIL_INDENT = SPINE_WIDTH + MARK_WIDTH - 1
const DETAIL_ROWS = 3
const TICK_MS = 1000
const IDLE_TICKS = 5

type Segment = {
  text: string
  isElastic?: boolean
  color?: string
  dimColor?: boolean
  weight?: 'semibold'
  wrap?: 'wrap' | 'truncate-end' | 'truncate-start'
  button?: { key: string; hotkey?: string; onPress: () => void }
}

const VIEW_WIDTH = 520
const STEP_CHARS = 22
const TIMELINE_STYLE =
  ':root{--line:#e3dcd3;--fg:#2a2521;--muted:#786e65;--accent:#b35a00;--green:#3d7a3a;--red:#b03434}' +
  '@media (prefers-color-scheme:dark){:root{--line:#332e29;--fg:#ebe4db;--muted:#9c9187;--accent:#ff8f40;--green:#9ccc7a;--red:#f07178}}' +
  '.rail{stroke:var(--line);stroke-width:2}.fill{stroke:var(--green);stroke-width:2}' +
  '.done{fill:var(--green)}.halted{fill:var(--red)}.ring{fill:none;stroke:var(--accent);stroke-width:2}.dot{fill:var(--accent)}.pending{fill:none;stroke:var(--muted);stroke-width:1.5}' +
  'text{font:17px system-ui,sans-serif;fill:var(--fg)}.sub{font-size:13px}.mid{text-anchor:middle}.dim{fill:var(--muted)}'
const GLYPHS = { done: '✓', running: '●', halted: '■', pending: '○' } as const

type State = keyof typeof GLYPHS
type SpineRow = { name: string; state: State; detail: string }

const xml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const node = (state: State, x: number, y: number): string =>
  state === 'running'
    ? `<circle class="ring" cx="${x}" cy="${y}" r="6"/><circle class="dot" cx="${x}" cy="${y}" r="2.5"/>`
    : `<circle class="${state}" cx="${x}" cy="${y}" r="5"/>`

const stepperSvg = (steps: SpineRow[]): string => {
  const column = VIEW_WIDTH / steps.length
  const x = (at: number) => column * at + column / 2
  const marks = steps.map(({ name, state, detail }, at) => {
    const link =
      at === 0
        ? ''
        : `<line class="${state === 'pending' ? 'rail' : 'fill'}" x1="${x(at - 1) + 8}" y1="10" x2="${x(at) - 8}" y2="10"/>`

    return (
      `${link}${node(state, x(at), 10)}<text class="mid${state === 'pending' ? ' dim' : ''}" x="${x(at)}" y="40">${xml(name)}</text>` +
      `<text class="mid sub dim" x="${x(at)}" y="58">${xml(detail)}</text>`
    )
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} 66"><style>${TIMELINE_STYLE}</style>${marks.join('')}</svg>`
}

const OPENED: StageRun = {
  stage: null,
  agentId: null,
  start: 0,
  durationMs: null,
  calls: 0,
  edits: 0,
  tests: 0,
  errors: 0,
  files: [],
  recent: [],
}

const lines = (text: string): SidecarLine[] =>
  text.split('\n').flatMap(line => {
    try {
      const parsed = JSON.parse(line)

      return parsed && SIDECAR_KINDS.has(parsed.kind) ? [parsed as SidecarLine] : []
    } catch {
      return []
    }
  })

const parse = (text: string): Plan | null => {
  const stages = [...text.matchAll(STAGE)]

  if (stages.length === 0) {
    return null
  }

  return {
    done: stages.filter(stage => stage[1] === 'x').length,
    total: stages.length,
    next: stages.find(stage => stage[1] === ' ')?.[2] ?? null,
    stages: stages.map(stage => ({ title: stage[2], isDone: stage[1] === 'x' })),
  }
}

const classify = (command: string, gate: string | null = null): RunKind | null => {
  if (COMMIT.test(command)) {
    return 'commit'
  }

  if (PUSH.test(command)) {
    return 'push'
  }

  if (PULL_REQUEST.test(command)) {
    return 'pr'
  }

  return (gate === null ? GATE.test(command) : plain(command).includes(plain(gate))) ? 'gate' : null
}

const plain = (text: string): string =>
  text
    .replace(/["']/g, '')
    .split(/\s+/)
    .map(token => token.slice(token.lastIndexOf('/') + 1))
    .join(' ')

const gateCommand = (written: SidecarLine[]): string | null => {
  const line = written.findLast(line => line.kind === 'gate' && line.command)

  return line?.kind === 'gate' && line.command ? line.command : null
}

const track = (
  kept: StageRun[],
  agentId: string,
  now: number,
  change: (stage: StageRun) => StageRun,
): StageRun[] => {
  const found = kept.findIndex(stage => stage.agentId === agentId)
  const claimed =
    found === -1
      ? kept.findLastIndex(stage => stage.agentId === null && stage.durationMs === null)
      : found

  if (claimed === -1) {
    return kept
  }

  return kept.map((stage, at) => (at === claimed ? change({ ...OPENED, ...stage, agentId }) : stage))
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const stamp = (kept: Times, shown: Plan | null, fresh: Plan | null, now: number): Times => {
  if (fresh === null) {
    return {}
  }

  const from = shown?.total === fresh.total ? shown.done : null
  const stamped: Times = from === null ? {} : { ...kept }

  for (let index = from ?? fresh.done; index < fresh.done; index++) {
    if (stamped[index]) {
      stamped[index] = { ...stamped[index], finish: now }
    }
  }

  if (fresh.done < fresh.total && from !== fresh.done) {
    stamped[fresh.done] = { start: now, finish: null }
  }

  return stamped
}

const span = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

const checkout = async ($: EngineInterface): Promise<{ repo: string; branch: string } | null> => {
  const git = await $.process.run([
    'git',
    'rev-parse',
    '--show-toplevel',
    '--abbrev-ref',
    'HEAD',
  ])
  const [root, branch] = git.stdout.trim().split('\n')

  if (git.exitCode !== 0 || !root || !branch) {
    return null
  }

  return { repo: root.slice(root.lastIndexOf('/') + 1), branch }
}

// checkpoint-plan writes ~/.claude/plans/<repo>-<branch>.md, `/` in the branch as `-`
const here = async ($: EngineInterface): Promise<string | null> => {
  const found = await checkout($)

  if (found && found.repo !== (await read($, repo))) {
    await update($, repo, () => found.repo)
  }

  return found && `${found.repo}-${found.branch.replaceAll('/', '-')}.md`
}

const unquote = (path: string): string => path.replace(/^(['"])(.*)\1$/, '$2')

const head = async ($: EngineInterface, command: string): Promise<string | null> => {
  const commit = COMMIT.exec(command)
  const flagged = [...(commit?.[0].matchAll(/\s-C\s+(\S+)/g) ?? [])].map(match => unquote(match[1]))
  const entered = [...command.slice(0, commit?.index ?? 0).matchAll(/(?:^|[;&|(])\s*cd\s+(\S+)/g)].at(-1)?.[1]
  const dirs = (flagged.length > 0 ? flagged : entered ? [unquote(entered)] : []).flatMap(dir => ['-C', dir])
  const ask = async (where: string[]): Promise<string | null> => {
    const git = await $.process.run(['git', ...where, 'rev-parse', `--short=${SHA_WIDTH}`, 'HEAD']).catch(() => null)
    const sha = git?.stdout.trim()

    return git?.exitCode === 0 && sha && /^[0-9a-f]+$/.test(sha) ? sha : null
  }

  // a `-C $VAR` means nothing outside the shell that set it, so the session's own checkout is asked next
  return (await ask(dirs)) ?? (dirs.length > 0 ? ask([]) : null)
}

const percentile = (values: number[], share: number): number =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * share) - 1)]

const day = (ms: number): string => {
  const date = new Date(ms)

  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
}

const history = async ($: EngineInterface): Promise<RunSummary[]> => {
  try {
    const stored = await $.store.get(RUNS)

    return Array.isArray(stored) ? (stored as RunSummary[]) : []
  } catch {
    return []
  }
}

const thresholds = (stored: RunSummary[]) => {
  const isEnough = stored.length >= MIN_RUNS
  const agentMs = stored.flatMap(summary => summary.stages.flatMap(stage => (stage.durationMs === null ? [] : [stage.durationMs])))
  const wallMs = stored.flatMap(summary => summary.stages.flatMap(stage => (stage.wallMs === null ? [] : [stage.wallMs])))
  const isStored = isEnough && agentMs.length > 0

  return {
    isStored,
    p50: isStored ? percentile(agentMs, 0.5) : P50_MS,
    p90: isStored ? percentile(agentMs, 0.9) : P90_MS,
    wall: isEnough && wallMs.length > 0 ? percentile(wallMs, 0.5) : WALL_MS,
  }
}

const open = async ($: EngineInterface, name: string | null): Promise<Plan | null> => {
  const home = await $.env.get('HOME')

  return name && home ? parse(await $.fs.read(`${home}/.claude/plans/${name}`)) : null
}

const target = async ($: EngineInterface): Promise<string | null> =>
  (await read($, followed)) ?? (await here($))

const journal = async ($: EngineInterface, name: string | null): Promise<SidecarLine[]> => {
  const home = await $.env.get('HOME')

  return name && home
    ? lines(await $.fs.read(`${home}/.claude/plans/${name.replace(/\.md$/, '.run.jsonl')}`).catch(() => ''))
    : []
}

const once = async ($: EngineInterface, key: string): Promise<boolean> => {
  if ((await read($, notified)).includes(key)) {
    return false
  }

  await update($, notified, kept => [...kept, key])

  return true
}

const save = async ($: EngineInterface, outcome: RunSummary['outcome']) => {
  if (!(await read($, shipping))) {
    return
  }

  try {
    const name = await target($)
    const found = await checkout($)
    const timed = await read($, times)
    const ran = await read($, stages)
    const startedAt = (await read($, runStart)) ?? undefined
    const endedAt = await $.clock.now()
    const entries = Object.entries(timed)
    const summary: RunSummary = {
      repo: found?.repo ?? '',
      plan: name ?? '',
      startedAt,
      endedAt,
      outcome,
      totalMs:
        entries.length === 0
          ? 0
          : Math.max(...entries.map(([, time]) => time.finish ?? endedAt)) -
            Math.min(...entries.map(([, time]) => time.start)),
      stages: entries.flatMap(([index, time]) => {
        const durationMs = ran.findLast(stage => stage.stage === Number(index) + 1 && stage.durationMs !== null)?.durationMs ?? null
        const wallMs = time.finish === null ? null : time.finish - time.start

        return durationMs === null && wallMs === null ? [] : [{ n: Number(index) + 1, durationMs, wallMs }]
      }),
    }

    const kept = await history($)
    const same = kept.findIndex(
      stored => startedAt !== undefined && stored.repo === summary.repo && stored.plan === summary.plan && stored.startedAt === startedAt,
    )

    await $.store.set(RUNS, (same === -1 ? [...kept, summary] : kept.map((stored, at) => (at === same ? summary : stored))).slice(-KEPT_RUNS))
  } catch {
    return
  }
}

const announce = async ($: EngineInterface, key: string, text: string) => {
  if (!(await once($, key))) {
    return
  }

  if (await read($, shipping)) {
    await $.ui.notify(text, { title: 'ship-plan' }).catch(() => undefined)
  }
}

// a session can work in a checkout it was not launched in, so a plan it names outranks its cwd's
const refresh = async ($: EngineInterface, named: string | null = null) => {
  if (named && (await open($, named).catch(() => null))) {
    await update($, followed, () => named)
  }

  const name = await target($).catch(() => null)
  const loaded = await open($, name).catch(() => null)
  const written = await journal($, name).catch(() => [])

  if (JSON.stringify(written) !== JSON.stringify(await read($, sidecar))) {
    await update($, sidecar, () => written)
  }

  const last = written.at(-1)

  if (last?.kind === 'halt') {
    await announce($, `halt:${JSON.stringify(last)}`, `ship-plan halted at stage ${last.stage}: ${last.reason}`)

    if (await once($, `store:halt:${JSON.stringify(last)}`)) {
      await save($, 'halted')
    }
  }

  const previous = await read($, shownName)

  if (name && name !== previous) {
    await update($, shownName, () => name)

    if (previous !== null) {
      await update($, plan, () => null)
      await update($, run, () => [])
      await update($, stages, () => [])
      await update($, expanded, () => null)
      await update($, times, () => ({}))
      await update($, shipping, () => false)
      await update($, stopped, () => false)
      await update($, runStart, () => null)
    }
  }

  const shown = await read($, plan)
  // a plan already finished when first seen is a past session's, not this one's
  const fresh = shown === null && loaded?.done === loaded?.total ? null : loaded

  if (JSON.stringify(fresh) === JSON.stringify(shown)) {
    return
  }

  await update($, plan, () => fresh)
  const now = await $.clock.now()
  await update($, times, kept => stamp(kept, shown, fresh, now))

  if (fresh?.done !== shown?.done) {
    await update($, stages, kept =>
      kept.map(stage =>
        stage.durationMs === null ? { ...stage, durationMs: now - stage.start } : stage,
      ),
    )
  }

  const hasFinished =
    fresh?.done === fresh?.total &&
    fresh?.total === shown?.total &&
    shown !== null &&
    shown.done < shown.total

  if (hasFinished) {
    $.ui.toast(`Plan complete: all ${shown.total} stages done`)
  }
}

// a ship run ticks a stage's box before its gate and commit, so there a tick alone does not finish it
const settle = (
  shown: Plan | null,
  ran: StageRun[],
  events: RunEvent[],
  isShipping: boolean,
): boolean[] =>
  (shown?.stages ?? []).map(
    (stage, index) =>
      stage.isDone &&
      (!isShipping ||
        !ran.some(record => record.stage === index + 1) ||
        ran.some(record => record.stage !== null && record.stage > index + 1) ||
        events.some(event => event.kind === 'commit' && event.stage === index + 1)),
  )

const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width)

export const wrapped = (text: string, width: number, most = DETAIL_ROWS): string[] => {
  const broken: string[] = []
  let rest = text.trim()

  while (rest && broken.length < most) {
    const space = rest.lastIndexOf(' ', width)
    const cut = rest.length <= width ? rest.length : space > 0 ? space : width

    broken.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }

  return rest ? [...broken.slice(0, -1), `${broken[broken.length - 1].slice(0, Math.max(0, width - 1))}…`] : broken
}

const titleWidth = (columns: number, hasSha: boolean): number =>
  Math.max(1, columns - GUTTER_WIDTH - SPINE_WIDTH - MARK_WIDTH - TIME_WIDTH - (hasSha ? 2 + SHA_WIDTH : 0))

const clock = (ms: number): string => {
  const date = new Date(ms)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

let idle = 0
let ticking: Timer | null = null

// the timer stops itself once no running pane has drawn for IDLE_TICKS ticks
const wake = ($: EngineInterface) => {
  idle = 0
  ticking ??= $.clock.every(TICK_MS, () => {
    idle += 1

    if (idle > IDLE_TICKS) {
      ticking?.cancel()
      ticking = null

      return
    }

    $.ui.invalidate('ui.render')
  })
}

const isShipPlan = (name: string): boolean => name === 'ship-plan' || name.endsWith(':ship-plan')
const isExecuteStage = (name: unknown): boolean => name === 'execute-stage' || String(name).endsWith(':execute-stage')

const startShip = async ($: EngineInterface) => {
  await update($, shipping, () => true)
  const shown = await read($, plan)
  const now = await $.clock.now()

  await update($, runStart, () => now)

  await update($, run, () => [])
  await update($, stages, () => [])
  await update($, expanded, () => null)
  await update($, times, () =>
    shown && shown.done < shown.total ? { [shown.done]: { start: now, finish: null } } : {},
  )

  const opened = await $.ui.open(TIMELINE)

  if (!opened.isPlaced) {
    $.ui.toast('Widen the terminal or run /plan-timeline')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plan-timeline',
      description: "Show the followed plan's stages in a pane",
    })
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'plan-timeline' }, async $ => {
    await $.ui.open(TIMELINE)

    return { text: 'Plan timeline pane opened.' }
  })

  on('skill.prompt', async ($, e, next) => {
    if (isShipPlan(e.skill)) {
      await startShip($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const started = await $.clock.now()
    const call = {
      tool: e.tool,
      summary: String(e.command ?? e.file_path ?? e.pattern ?? ''),
    }

    const agentId = e.agentId

    if (!agentId) {
      await update($, stopped, () => false)
    }

    if (agentId) {
      await update($, stages, kept =>
        track(kept, agentId, started, stage => ({
          ...stage,
          calls: stage.calls + 1,
          files: (e.tool === 'Edit' || e.tool === 'Write') && !stage.files.includes(e.file_path) ? [...stage.files, e.file_path] : stage.files,
          recent: [...stage.recent, { ...call, isDone: false, isError: false }].slice(-CALLS),
        })),
      )
    }

    const forked = e.tool === 'Skill' && isExecuteStage(e.skill)

    if ((e.tool === 'Agent' || forked) && !agentId) {
      const shown = await read($, plan)
      const number = (forked || (e.tool === 'Agent' && e.subagent_type === EXECUTOR)) && shown && shown.done < shown.total ? shown.done + 1 : null

      await update($, stages, kept => [...kept, { ...OPENED, stage: number, start: started }])
    }

    const ran = await next(e)

    if (agentId) {
      await update($, stages, kept =>
        track(kept, agentId, started, stage => {
          const index = stage.recent.findLastIndex(
            row => !row.isDone && row.tool === call.tool && row.summary === call.summary,
          )

          return {
            ...stage,
            edits: stage.edits + (EDITS.has(e.tool) ? 1 : 0),
            tests: stage.tests + (e.tool === 'Bash' && classify(call.summary) === 'gate' ? 1 : 0),
            errors: stage.errors + (ran.isError === true ? 1 : 0),
            recent: stage.recent.map((row, at) => (at === index ? { ...row, isDone: true, isError: ran.isError === true } : row)),
          }
        }),
      )
    }

    const spawned = e.tool === 'Agent' && !agentId ? (ran.result as { agentId?: string } | undefined)?.agentId : undefined

    if (spawned) {
      await update($, stages, kept =>
        kept.some(stage => stage.agentId === spawned)
          ? kept
          : kept.map((stage, at) =>
              at === kept.findLastIndex(open => open.agentId === null)
                ? { ...stage, agentId: spawned }
                : stage,
            ),
      )
    }

    const command = e.tool === 'Bash' && !e.agentId ? String(e.command ?? '') : ''
    const configured = command ? gateCommand(await journal($, await target($).catch(() => null)).catch(() => [])) : null
    const kind = command.includes(SIDECAR_FILE) ? null : classify(command, configured)

    if (kind) {
      const finished = await $.clock.now()
      const text = String(ran.text ?? '')
      const sha = kind === 'commit' && ran.isError !== true ? (text.match(SHA)?.[1] ?? (await head($, command))) : null
      const closed = (await read($, stages)).findLast(
        stage => stage.stage !== null && stage.durationMs !== null,
      )
      const events: Record<RunKind, RunEvent> = {
        gate: {
          kind: 'gate',
          stage: closed?.stage ?? null,
          command,
          isError: ran.isError === true,
          durationMs: finished - started,
          at: finished,
        },
        commit: { kind: 'commit', stage: closed?.stage ?? null, sha, at: finished },
        push: { kind: 'push', at: finished },
        pr: { kind: 'pr', url: text.match(PR_URL)?.[0] ?? null, at: finished },
      }

      await update($, run, kept => [...kept, events[kind]])

      const url = events.pr.kind === 'pr' ? events.pr.url : null

      if (kind === 'pr' && url) {
        await announce($, `pr:${url}`, `ship-plan opened ${url}`)
      }

      if (kind === 'pr' && url && (await once($, `store:pr:${url}`))) {
        await save($, 'pr')
      }

      if (kind === 'pr' && url) {
        await update($, shipping, () => false)
        await update($, stopped, () => false)
      }
    }

    const named = JSON.stringify(e).match(NAMED)?.[1] ?? null

    if (named || WRITERS.has(e.tool)) {
      await refresh($, named)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId

    if (agentId) {
      const finished = await $.clock.now()

      await update($, stages, kept =>
        track(kept, agentId, finished, stage => ({
          ...stage,
          durationMs: stage.durationMs ?? finished - stage.start,
        })),
      )
    }

    if (!agentId && (await read($, shipping))) {
      const shown = await read($, plan)
      const hasHalted = (await read($, sidecar)).at(-1)?.kind === 'halt'
      const hasPr = (await read($, run)).some(event => event.kind === 'pr' && event.url)
      const isWorking = (await read($, stages)).some(stage => stage.durationMs === null)

      if (shown && shown.done < shown.total && !hasPr && !hasHalted && !isWorking) {
        const wasStopped = await read($, stopped)

        await update($, stopped, () => true)

        if (!wasStopped) {
          await save($, 'stopped')
          await announce(
            $,
            `stop:${await read($, runStart)}:${shown.done + 1}`,
            `ship-plan stopped at stage ${shown.done + 1}, no reason recorded`,
          )
        }
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const isDesktop = e.surface === 'desktop'
    const Svg = isDesktop ? $.ui.resolve(e).Svg : undefined
    const shown = await read($, plan)
    const name = await read($, repo)
    const rows = Math.max(1, e.props.placement === 'dock' ? e.props.scroll.bodyRows : (e.viewport?.rows ?? 24) - 4)
    const timed = await read($, times)
    // state outlives a reload, so a record written before a field was added takes that field's opened value
    const ran = (await read($, stages)).map(stage => ({ ...OPENED, ...stage }))
    const opened = await read($, expanded)
    const events = await read($, run)
    const written = await read($, sidecar)
    const isShipping = await read($, shipping)
    const isStopped = await read($, stopped)
    const working = ran.filter(stage => stage.durationMs === null)
    const current = working.findLast(stage => stage.stage !== null) ?? working.at(-1)
    const now = await $.clock.now()
    const last = written.at(-1)
    const halt = last?.kind === 'halt' ? last : null
    const settled = settle(shown, ran, events, isShipping)
    const running = settled.indexOf(false)

    if (running !== -1 || isShipping) {
      wake($)
    }

    const elapsed = (index: number) => {
      const time = timed[index]

      return time && (running === -1 || index <= running)
        ? (index === running ? now : (time.finish ?? now)) - time.start
        : null
    }
    const row = (
      content: string | Segment[],
      props: Omit<Segment, 'text'> = {},
    ): Segment[] =>
      typeof content === 'string'
        ? [{ text: content, isElastic: true, ...props }]
        : content
    const SEPARATOR: Segment = { text: ' · ', dimColor: true }
    const joined = (parts: Segment[]): Segment[] =>
      parts.flatMap((part, at) => (at === 0 ? [part] : [SEPARATOR, part]))
    const cell = ({ text, isElastic, button, ...props }: Segment, at: number) =>
      button ? (
        <Button plain {...button}>
          <Text wrap="truncate-end" {...props}>
            {text}
          </Text>
        </Button>
      ) : isElastic ? (
        <Text key={at} wrap="truncate-end" {...props}>
          {text}
        </Text>
      ) : (
        <Box key={at} flexShrink={0}>
          <Text {...props}>
            {text}
          </Text>
        </Box>
      )
    const block = (
      name: string,
      rows: Segment[][],
      chip?: Segment,
      title: Omit<Segment, 'text'> = { dimColor: true },
    ) => [
      <Box>
        {cell({ text: name, ...title }, 0)}
        {chip && cell(chip, 1)}
      </Box>,
      ...rows.map(cells => (
        <Box>
          {cells.map(cell)}
        </Box>
      )),
    ]

    const stored = await history($)
    const { isStored, p50, p90, wall } = thresholds(stored)
    const tagline = (
      <Box justifyContent="space-between">
        <Text dimColor>
          {`${isShipping || events.length > 0 ? 'ship-plan' : 'plan'}${name ? ` · ${name}` : ''}`}
        </Text>
        {!isDesktop && (
          <Text dimColor>
            /plan-timeline
          </Text>
        )}
      </Box>
    )
    const blank = (
      <Text wrap="truncate-end">
        {' '}
      </Text>
    )
    const headed = (parts: unknown[]) => [tagline, blank, ...parts].slice(0, rows)

    if (shown === null || (shown.done === shown.total && events.length === 0 && ran.length === 0)) {
      const recent = stored.filter(summary => summary.repo === name).slice(-RECENT_RUNS).reverse()
      const OUTCOMES = { pr: { text: 'PR', color: 'success' }, halted: { text: 'halted', color: 'error' }, stopped: { text: 'stopped', color: FILL } }
      const idle = [
        ...(recent.length === 0
          ? []
          : [
              block(
                'LAST RUNS · this repo',
                recent.map(summary =>
                  isDesktop
                    ? [
                        { text: `${day(summary.endedAt)}  `, dimColor: true },
                        { text: `${count(summary.stages.length, 'stage')}  ` },
                        { text: `${span(summary.totalMs)}  ` },
                        OUTCOMES[summary.outcome],
                      ]
                    : row([
                        { text: day(summary.endedAt), dimColor: true },
                        { text: `  ${count(summary.stages.length, 'stage').padEnd(9)}  ${span(summary.totalMs).padStart(7)}  `, isElastic: true },
                        OUTCOMES[summary.outcome],
                      ]),
                ),
              ),
            ]),
        block(
          'YOUR STAGE TIMES',
          [
            isDesktop
              ? [{ text: 'typical  ', dimColor: true }, { text: `${span(p50)}  ` }, { text: 'p50', dimColor: true }]
              : row([{ text: `typical  ${span(p50).padEnd(7)} `, isElastic: true }, { text: 'p50', dimColor: true }]),
            isDesktop
              ? [{ text: 'slow  ', dimColor: true }, { text: `${span(p90)}  ` }, { text: 'p90', dimColor: true }]
              : row([{ text: `slow     ${span(p90).padEnd(7)} `, isElastic: true }, { text: 'p90', dimColor: true }]),
            isStored
              ? row(`${stored.length} runs stored`, { dimColor: true })
              : row(`measured 09 Oct · ${stored.length} of ${MIN_RUNS} runs stored`, { color: FILL }),
          ],
        ),
        block(
          'NEXT',
          [
            row(shown === null ? 'no plan on this branch' : 'plan complete', { dimColor: true }),
            row('/checkpoint-plan', { color: FILL, weight: 'semibold' }),
          ],
        ),
      ]

      if (isDesktop) {
        return (
          <Box flexDirection="column" gap={2} padding={2}>
            {tagline}
            {idle.map(part => (
              <Box flexDirection="column">{part}</Box>
            ))}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.scroll.bodyRows}>
          {headed(idle.flatMap((part, index) => (index === 0 ? part : [blank, ...part])))}
        </Box>
      )
    }

    const heat = (ms: number) => (ms > p90 ? 'error' : ms > p50 ? 'warning' : 'success')
    const isDone = running === -1
    const starts = Object.values(timed).map(time => time.start)
    const ends = Object.values(timed).map(time => time.finish ?? now)
    const gates = events.filter(event => event.kind === 'gate')
    const staged = ran.filter(stage => stage.stage !== null)
    const outcomes = new Map(written.flatMap(line => (line.kind === 'stage' ? [[line.n, line] as const] : [])))
    const verdict = (line: Extract<SidecarLine, { kind: 'stage' }>): Segment => ({
      text: `${line.outcome}${line.note ? `: ${line.note}` : ''}`,
      ...(line.outcome === 'blocked' ? { color: 'error' } : {}),
    })
    const counts = (stage: StageRun): Segment[] =>
      row(
        [count(stage.calls, 'call'), count(stage.edits, 'edit'), count(stage.tests, 'test'), count(stage.errors, 'error')].join(' · '),
      )
    const callCells = (call: StageRun['recent'][number]): Segment[] => [
      {
        text: `${call.isDone ? (call.isError ? '✗' : '✓') : '●'} ${call.tool}`,
        ...(call.isDone ? { color: call.isError ? 'error' : 'success' } : { color: FILL, weight: 'semibold' }),
      },
      { text: `  ${call.summary}`, isElastic: true },
    ]
    const moments = [
      ...staged.map(stage => stage.start),
      ...events.map(event => (event.kind === 'gate' ? event.at - event.durationMs : event.at)),
    ]
    const finishes = [...events.map(event => event.at), ...staged.map(stage => stage.start + (stage.durationMs ?? 0))]
    const origin = moments.length === 0 ? now : Math.min(...moments)
    const finish = isDone && finishes.length > 0 ? Math.max(...finishes) : now
    const hasSha = titleWidth(e.props.bodyColumns, true) >= MIN_TITLE
    const width = titleWidth(e.props.bodyColumns, hasSha)
    const gutter = (text = ''): Segment[] =>
      GUTTER ? [{ text: `${text.padEnd(GUTTER_WIDTH - 2)}  `, dimColor: true }] : []
    const entries = shown.stages.map((stage, index) => {
      const number = index + 1
      const record = staged.findLast(run => run.stage === number)
      const gate = gates.findLast(event => event.stage === number)
      const commit = events.findLast(event => event.kind === 'commit' && event.stage === number)
      const outcome = outcomes.get(number)
      const isHalted = halt?.stage === number
      const isLast = number === shown.total
      const ms = record ? (record.durationMs ?? now - record.start) : elapsed(index)
      const sha = commit?.kind === 'commit' ? commit.sha?.slice(0, SHA_WIDTH) : undefined
      const detail: Segment | null =
        outcome && outcome.outcome !== 'as-planned'
          ? verdict(outcome)
          : gate?.isError
            ? { text: 'gate failed', color: 'error' }
            : null
      const note = outcome?.outcome === 'as-planned' && outcome.note ? verdict(outcome) : null
      const isExpandable = typeof record?.durationMs === 'number' || note !== null
      const hotkey = isExpandable && number < 10 ? String(number) : null
      const isOpen = isExpandable && opened === number
      const shownDetail = isOpen ? (detail ?? note) : detail
      const lead: Segment[] = [...gutter(), { text: isLast ? ' ' : '│', dimColor: true }]
      const nest = (cells: Segment[]): Segment[] => [...lead, { text: ' '.repeat(DETAIL_INDENT) }, ...cells]

      return {
        title: row([
          ...gutter(record ? clock(record.start) : ''),
          { text: isLast ? '└─ ' : '├─ ', dimColor: true },
          isHalted
            ? { text: '■ ', color: 'error' }
            : settled[index]
              ? { text: '✓ ', color: 'success' }
              : index === running
                ? { text: '● ', color: FILL }
                : { text: '○ ', dimColor: true },
          {
            text: hotkey ? fit(stage.title, width - HOTKEY_WIDTH) : fit(`${number} ${stage.title}`, width),
            isElastic: true,
            ...(isExpandable
              ? {
                  button: {
                    key: `stage-${number}`,
                    ...(hotkey ? { hotkey } : {}),
                    onPress: () => void update($, expanded, at => (at === number ? null : number)),
                  },
                }
              : {}),
            ...(isHalted || settled[index] ? {} : index === running ? { weight: 'semibold' } : { dimColor: true }),
          },
          ms === null
            ? { text: ' '.repeat(TIME_WIDTH) }
            : { text: span(ms).padStart(TIME_WIDTH), color: heat(ms) },
          ...(sha && hasSha ? [{ text: `  ${sha}`, color: FILL }] : []),
        ]),
        details: [
          ...(shownDetail
            ? wrapped(shownDetail.text, Math.max(1, e.props.bodyColumns - GUTTER_WIDTH - 1 - DETAIL_INDENT)).map(text =>
                row([...lead, { ...shownDetail, text: `${' '.repeat(DETAIL_INDENT)}${text}` }]),
              )
            : []),
          ...(isOpen && record
            ? [
                nest(counts(record)),
                ...record.files.slice(0, FILES).map(file => nest(row(file, { wrap: 'truncate-start' }))),
                ...(record.files.length > FILES ? [nest(row(`+${record.files.length - FILES} more`, { dimColor: true }))] : []),
                ...record.recent.map(call => nest(callCells(call))),
              ]
            : []),
        ],
        spacer: isLast ? null : row([...gutter(), { text: '│', dimColor: true }]),
        number,
        label: stage.title,
        state: (isHalted ? 'halted' : settled[index] ? 'done' : index === running ? 'running' : 'pending') as State,
        start: record ? clock(record.start) : '',
        ms,
        sha: sha ?? '',
        mark: detail ? { text: detail.text.split(':')[0], tone: detail.color === 'error' ? 'error' : 'warning' } : null,
        isOpen,
        callout: shownDetail,
        body: isOpen && record
          ? [
              counts(record),
              ...record.files.slice(0, FILES).map(file => row(file, { wrap: 'truncate-start' })),
              ...(record.files.length > FILES ? [row(`+${record.files.length - FILES} more`, { dimColor: true })] : []),
              ...record.recent.map(callCells),
            ]
          : [],
        press: isExpandable
          ? { key: `stage-${number}`, ...(hotkey ? { hotkey } : {}), onPress: () => void update($, expanded, at => (at === number ? null : number)) }
          : null,
      }
    })
    const indent = ' '.repeat(GUTTER_WIDTH + SPINE_WIDTH)
    const agentMs = staged.reduce((sum, stage) => sum + (stage.durationMs ?? 0), 0)
    const gateMs = gates.reduce((sum, event) => sum + event.durationMs, 0)
    const loopMs = Math.max(0, finish - origin - agentMs - gateMs)
    const foot = isDone
      ? [
          row(`${indent}sub-agents ${span(agentMs)} · gates ${span(gateMs)} · main loop ${span(loopMs)}`, { dimColor: true }),
        ]
      : []
    const stageRows = (isTight: boolean) => [
      ...entries.flatMap(entry => [
        entry.title,
        ...entry.details,
        ...(entry.spacer && !isTight ? [entry.spacer] : []),
      ]),
      ...foot,
    ]
    const diverged = [...outcomes.values()].filter(line => line.outcome !== 'as-planned').map(line => line.n).sort((a, b) => a - b)

    const isStarted = shown.done > 0 || ran.length > 0 || events.length > 0 || written.some(line => line.kind === 'gate')
    const isEnded = halt !== null || isStopped
    const gate = gateCommand(written)
    const paired = events.findLast(event => event.kind === 'pr' && event.url)
    const address = paired?.kind === 'pr' ? paired.url : null
    const hasPushed = events.some(event => event.kind === 'push')
    const mark = (glyph: string, name: string, props: Omit<Segment, 'text'>): Segment => ({
      text: `${glyph} ${name}`.padEnd(LABEL_WIDTH),
      ...props,
    })
    const progress = isStarted
      ? joined([
          {
            text: `${isEnded ? `${halt ? 'halted' : 'stopped'} at ` : ''}${isDone ? shown.total : running + 1} of ${shown.total}`,
          },
          ...(starts.length > 0 ? [{ text: span(Math.max(...ends) - Math.min(...starts)) }] : []),
          ...(isShipping && !isDone && !isEnded
            ? [
                {
                  text: `~${Math.round(
                    Math.max(0, (shown.total - running) * wall - (timed[running] ? now - timed[running].start : 0)) / 60_000,
                  )}m left`,
                  dimColor: true,
                },
              ]
            : []),
        ])
      : [{ text: `0 of ${shown.total}` }]

    const section = (label: string) => (
      <Text dimColor weight="semibold">
        {label}
      </Text>
    )
    const journey = (): unknown[] => {
      const step = (name: string, state: State, detail = ''): SpineRow => ({ name, state, detail })
      const steps = [
        step('preflight', isStarted ? 'done' : 'pending', gate ?? ''),
        step('stages', isEnded ? 'halted' : isDone ? 'done' : isStarted ? 'running' : 'pending', progress[0].text),
        ...(isShipping || hasPushed || address !== null
          ? [step('push', hasPushed ? 'done' : 'pending'), step('PR', address ? 'done' : 'pending', address ? 'opened' : '')]
          : []),
      ]
      const badge = halt ? 'HALTED' : isStopped ? 'STOPPED' : address ? 'PR OPEN' : null
      const isBad = halt !== null || isStopped

      return [
        <Box justifyContent="space-between">
          {section('JOURNEY')}
          {badge && (
            <Text color={isBad ? 'error' : 'success'} backgroundColor={isBad ? 'diffRemovedDimmed' : 'diffAddedDimmed'}>
              {` ${badge} `}
            </Text>
          )}
        </Box>,
        Svg && (
          <Svg
            source={stepperSvg(steps.map(one => ({ ...one, detail: fit(one.detail, STEP_CHARS).trimEnd() })))}
            alt={steps.map(({ name, state, detail }) => `${GLYPHS[state]} ${name} ${detail}`.trim()).join(', ')}
          />
        ),
        address && <Text color={FILL}>{address}</Text>,
      ]
    }
    const timeline = (): unknown[] => {
      const overall = progress
        .filter(part => part !== SEPARATOR)
        .slice(1)
        .map(part => part.text)
        .join(' · ')
      const spent = [
        { label: 'sub-agents', ms: agentMs },
        { label: 'gates', ms: gateMs },
        { label: 'main loop', ms: loopMs },
      ]
      const dots = {
        done: ['●', { color: 'success' }],
        running: ['●', { color: FILL, weight: 'semibold' }],
        halted: ['■', { color: 'error' }],
        pending: ['○', { dimColor: true }],
      } as const
      const firstLine = (cells: Segment[]): Segment[] => cells.map(one => ({ ...one, text: one.text.split('\n')[0] }))
      const column = (width: number, text: string, props: Omit<Segment, 'text'> = {}) => (
        <Box width={width} flexShrink={0} justifyContent="flex-end">
          <Text {...props}>{text}</Text>
        </Box>
      )

      return [
        <Box justifyContent="space-between">
          {section('STAGES')}
          {overall && <Text dimColor>{overall}</Text>}
        </Box>,
        <Box flexDirection="column">
          {entries.map(({ number, label, state, start, ms, sha, mark, press, isOpen, callout, body }) => [
            <Box gap={1}>
              <Text {...dots[state][1]}>{dots[state][0]}</Text>
              <Text dimColor>{String(number).padStart(2)}</Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" gap={1}>
                {cell(
                  {
                    text: label,
                    isElastic: true,
                    ...(press ? { button: press } : {}),
                    ...(state === 'running' ? { weight: 'semibold' } : state === 'pending' ? { dimColor: true } : {}),
                  },
                  0,
                )}
                {mark && (
                  <Box flexShrink={0}>
                    <Text color={mark.tone}>{mark.text}</Text>
                  </Box>
                )}
              </Box>
              {column(5, start, { dimColor: true })}
              {column(7, ms === null ? '' : span(ms), ms === null ? {} : { color: heat(ms) })}
              {column(7, sha, { color: FILL })}
            </Box>,
            isOpen && (
              <Box flexDirection="column" marginLeft={5}>
                {callout && (
                  <Box
                    borderStyle="round"
                    {...(callout.color === 'error' ? { borderColor: 'error' } : mark ? { borderColor: 'warning' } : { borderDimColor: true })}
                  >
                    <Text wrap="wrap">{callout.text}</Text>
                  </Box>
                )}
                {body.map(cells => (
                  <Box gap={1}>{firstLine(cells).map(cell)}</Box>
                ))}
              </Box>
            ),
          ])}
        </Box>,
        <Box gap={2}>
          <Text color="success">{`● under p50 (${span(p50)})`}</Text>
          <Text color="warning">{`● to p90 (${span(p90)})`}</Text>
          <Text color="error">● over p90</Text>
        </Box>,
        isDone && (
          <Box>
            {spent.map(({ label, ms }) => (
              <Box flexDirection="column" flexGrow={1}>
                <Text weight="semibold">{span(ms)}</Text>
                <Text dimColor>{label}</Text>
              </Box>
            ))}
          </Box>
        ),
      ]
    }

    const arrange = (isTight: boolean) => [
      isDesktop ? journey() : block(
        'JOURNEY',
        [
          row([
            mark(isStarted ? '✓' : '○', 'preflight', isStarted ? { color: 'success' } : { dimColor: true }),
            ...(gate ? [{ text: 'gate ', dimColor: true }, { text: gate, isElastic: true }] : []),
          ]),
          row([
            isEnded
              ? mark('■', 'stages', { color: 'error', weight: 'semibold' })
              : isDone
                ? mark('✓', 'stages', { color: 'success' })
                : isStarted
                  ? mark('●', 'stages', { color: FILL, weight: 'semibold' })
                  : mark('○', 'stages', { dimColor: true }),
            ...progress,
          ]),
          ...(isShipping || hasPushed || address !== null
            ? [
                row([hasPushed ? mark('✓', 'push', { color: 'success' }) : mark('○', 'push', { dimColor: true })]),
                row([
                  address ? mark('✓', 'PR', { color: 'success' }) : mark('○', 'PR', { dimColor: true }),
                  ...(address ? [{ text: address, color: FILL, isElastic: true }] : []),
                ]),
              ]
            : []),
        ],
        halt
          ? { text: '  HALTED', weight: 'semibold', color: 'error' }
          : isStopped
            ? { text: '  STOPPED', weight: 'semibold', color: 'error' }
            : address
              ? { text: '  PR OPEN', weight: 'semibold', color: 'success' }
              : undefined,
      ),
      ...(isEnded
        ? [
            block(
              'NEEDS YOU',
              halt
                ? [row(halt.reason, { color: 'error', wrap: 'wrap' }), row(halt.needs, { wrap: 'wrap' })]
                : [row('no reason recorded', { color: 'error', wrap: 'wrap' })],
              undefined,
              { color: 'error', weight: 'semibold' },
            ),
          ]
        : []),
      isDesktop ? timeline() : block(
        'STAGES',
        stageRows(isTight),
      ),
      ...(current
        ? [
            block(
              `NOW${current.stage === null ? '' : ` · stage ${current.stage}`}`,
              [
                counts(current),
                ...current.recent.map(callCells),
              ],
            ),
          ]
        : []),
      ...(isEnded
        ? []
        : isDone
          ? diverged.length === 0
            ? []
            : [
                block(
                  'NEEDS YOU',
                  [
                    row(
                      joined([
                        { text: `${count(diverged.length, 'stage')} diverged from the plan`, color: FILL },
                        { text: `${diverged.length === 1 ? 'stage' : 'stages'} ${diverged.join(', ')}`, dimColor: true, isElastic: true },
                      ]),
                    ),
                  ],
                ),
              ]
          : []),
      ...(shown.done < shown.total && !isShipping && working.length === 0
        ? [
            block(
              'NEXT',
              [
                row([
                  { text: '/ship-plan', color: FILL, weight: 'semibold' },
                  { text: ' or /execute-stage for one stage', dimColor: true, isElastic: true },
                ]),
              ],
            ),
          ]
        : []),
    ]
    const compose = (isTight: boolean) =>
      arrange(isTight).flatMap((part, index) => (index === 0 ? part : [blank, ...part]))
    const full = compose(false)

    if (isDesktop) {
      return (
        <Box flexDirection="column" gap={2} padding={2}>
          {tagline}
          {arrange(true).map(part => (
            <Box flexDirection="column" gap={1}>{part}</Box>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.scroll.bodyRows}>
        {headed(full.length + 2 > rows ? compose(true) : full)}
      </Box>
    )
  })
}
