import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, Timer, ToolCallArgs } from 'claude-code'

import type { Ci, Highlight, Session } from '../types'

const PANE = 'mission-control'
const OPEN = { id: PANE, title: 'Mission Control', columns: 90 }
const PERIOD_MS = 5000
const RUN_TIMEOUT_MS = 10000
const TAIL_BYTES = '262144'
const CHECK_MS = 60000
const STUCK_MS = 600000
const STUCK_TOOL_MS = 1800000
const HIGHLIGHTS_MAX = 20
const FEED_MAX = 8
const CLOCK = 6
const ICON = 2
const COMMAND_MAX = 24
const SHADE = '#1f232a'
const BLUE = '#6ea8ea'
const GREY = '#79808e'
const RED = '#ef6b6b'
const AMBER = '#e3a948'
const GREEN = '#5cc283'
const LINE = '#2e333b'
const LABEL = 8
const MOBILE_HIGHLIGHTS = 4
const DETAIL_INDENT = 5
const NAME = 19
const MODEL = 10
const AGE = 4
const CTX = 4
const SHARE = 4
const FIXED = 3 + 2 + NAME + 1 + MODEL + 1 + CTX + 1 + AGE + 1
const CTX_WARN = 70
const CTX_ERROR = 90
const VERDICTS: Record<string, string> = { 'CHANGES REQUESTED': 'error', APPROVED: 'success', COMMENT: 'warning' }
const TURN = new Set(['busy', 'idle'])
const LANES = ['NEEDS YOU', 'CODING', 'REVIEWING']
const MARKS = {
  busy: ['●', BLUE],
  waiting: ['●', 'error'],
  stuck: ['◐', 'warning'],
  done: ['✓', 'success'],
} as const

const isOpen = atom({ plugin: 'mission-control', key: 'isOpen' } as const, false)
const sessions = atom({ plugin: 'mission-control', key: 'sessions' } as const, [] as Session[])
const expanded = atom({ plugin: 'mission-control', key: 'expanded' } as const, null as string | null)
const highlights = atom({ plugin: 'mission-control', key: 'highlights' } as const, [] as Highlight[])
const phases = atom({ plugin: 'mission-control', key: 'phases' } as const, null as Record<string, string> | null)
const stale = atom({ plugin: 'mission-control', key: 'stale' } as const, { at: 0, lines: [] as string[] })
const checks = atom({ plugin: 'mission-control', key: 'checks' } as const, {} as Record<string, { at: number; ci: Ci | null }>)
const activity = atom({ plugin: 'mission-control', key: 'activity' } as const, [] as Highlight[])
const fed = atom({ plugin: 'mission-control', key: 'fed' } as const, null as string[] | null)
const seen = atom({ plugin: 'mission-control', key: 'seen' } as const, null as string[] | null)
const told = atom({ plugin: 'mission-control', key: 'told' } as const, {} as Record<string, string>)
const tally = atom({ plugin: 'mission-control', key: 'tally' } as const, { at: 0, commits: 0, prs: 0, reviews: 0 })

// copied from evidence-band, with just added: a runner in command position, after any env assignments and wrappers
const RUNNER =
  /(?:^|&&|[;|(\n])\s*(?:\w+=\S+\s+)*(?:(?:time|env|npx|bunx|bash|sh|zsh|timeout\s+\S+)\s+)*(?:\S*\/)?(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|(?:go|cargo|dotnet|bazel|dbt|swift|just)\s+(?:test|build|check|vet|clippy)|claude\s+plugin\s+(?:test|validate)|python3?\s+-m\s+(?:pytest|unittest)|(?:jest|vitest|tsc|pytest|make|mvnw?|gradlew?|sbt|bats|rspec|ctest|test_\w+\.\w+)(?=\s|$))/
const COMMIT = /\bgit\s+(?:-\S+(?:\s+[^-\s]\S*)?\s+)*commit\b/
const REVIEW = /^Review PR #(\d+) \| (\S+)/

const homeOf = async ($: EngineInterface): Promise<string> => (await $.env.get('HOME')) ?? ''
const liveOf = (home: string, sessionId: string): string => `${home}/.claude/mission-control/live/${sessionId}.json`
const tokenPathOf = (home: string): string => `${home}/.claude/mission-control/token`

const ENVELOPE = /^<cross-session-message[^>]*>\n?|\n?<\/cross-session-message>$/g
const KINDS = ['answer', 'allow', 'deny', 'prompt'] as const

type Message = { mc: string; kind: (typeof KINDS)[number]; text?: string; question?: number }
type Asked = { question: string; options?: { label: string }[] }
type Asking = { questions: Asked[]; answers: Record<string, string>; settle: () => void }
type Call = { tool: string; detail?: string; key?: string; decide: (kind: 'allow' | 'deny') => void }
type Listed = Pick<Session, 'sessionId' | 'id' | 'name' | 'kind' | 'status' | 'state' | 'cwd' | 'startedAt'>
type Live = Pick<Session, 'context' | 'window' | 'running' | 'ask' | 'permission'>

const readToken = async ($: EngineInterface): Promise<string> => $.fs.read(tokenPathOf(await homeOf($))).then(text => text.trim(), () => '')

const tokenOf = async ($: EngineInterface): Promise<string> => {
  const kept = await readToken($)

  if (kept) {
    return kept
  }

  const made = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')

  await $.fs.write(tokenPathOf(await homeOf($)), made)

  return made
}

const parsedOf = (text: string): Partial<Message> | null => {
  try {
    return JSON.parse(text.replace(ENVELOPE, '').trim())
  } catch {
    return null
  }
}

const verified = async ($: EngineInterface, text: string): Promise<Message | null> => {
  const message = parsedOf(text)

  return message && KINDS.some(kind => kind === message.kind) && message.mc === (await tokenOf($)) ? (message as Message) : null
}

const report = async ($: EngineInterface, patch: object) => {
  try {
    const path = liveOf(await homeOf($), await $.session.id())
    const prior = await $.fs.read(path).then(text => JSON.parse(text) as object).catch(() => ({}))

    await $.fs.write(path, JSON.stringify({ ...prior, ...patch }))
  } catch {}
}

// the first question still unanswered, as the pane draws it
const askOf = ({ questions, answers }: Pick<Asking, 'questions' | 'answers'>) => {
  const index = questions.findIndex(one => !(one.question in answers))

  return index < 0 ? undefined : { question: questions[index]?.question ?? '', options: (questions[index]?.options ?? []).map(option => option.label), index }
}

const fillOf = (percent: number, [low, warn, error]: readonly [string, string, string]): string => (percent >= CTX_ERROR ? error : percent >= CTX_WARN ? warn : low)

const ctxOf = (percent: number | undefined): [string, string] => (percent === undefined ? ['', GREY] : [`${percent}%`, fillOf(percent, [GREY, 'warning', 'error'])])

const quietOf = (one: Session, now: number): number => {
  if (one.status !== 'busy') {
    return 0
  }

  const [since, limit] = one.running ? [one.running.since, STUCK_TOOL_MS] : [one.mtimeMs, STUCK_MS]

  return since && now - since >= limit ? Math.floor((now - since) / 60000) : 0
}

const runningOf = (one: Session, now: number): string =>
  one.running ? `running ${one.running.command === undefined ? one.running.tool : `$ ${one.running.command.replace(/\s+/g, ' ').slice(0, COMMAND_MAX)}`} · ${Math.floor((now - one.running.since) / 60000)}m` : ''

const laneOf = (one: Session, now: number): number => (one.status === 'waiting' || quietOf(one, now) > 0 ? 0 : one.name.startsWith('Review PR #') ? 2 : 1)

const phaseOf = (one: Session, now: number): string => (one.state === 'done' ? 'done' : one.status === 'waiting' ? 'waiting' : quietOf(one, now) > 0 ? 'stuck' : one.status)

// a renamed session's ai-title repeats its name, so its last prompt says more
const taskOf = (one: Session): string => (one.title && one.title !== one.name ? one.title : one.prompt || one.name)

const headlineOf = (one: Session, phase: string, quiet: number, running: string): [string, string | undefined] =>
  phase === 'waiting' ? [one.permission ? `permission: ${one.permission.tool}` : 'input needed', 'error'] : quiet > 0 ? [running || `quiet ${quiet}m`, 'warning'] : running ? [running, BLUE] : one.verdict ? [one.verdict, VERDICTS[one.verdict]] : [one.review || taskOf(one), undefined]

const fit = (text: string, width: number): string => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width))

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const agentOf = (one: Session): string => {
  const review = one.name.match(REVIEW)

  return review ? `#${review[1]}` : one.name
}

const clock = (ms: number): string => {
  const date = new Date(ms)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const shortOf = (one: Session): string => {
  const review = one.name.match(REVIEW)

  return review ? `#${review[1]} ${review[2]}` : one.name
}

const modelOf = (model: string): string => {
  const made = model.match(/^claude-([a-z]+)-(\d+)-(\d+)/)

  return made ? `${(made[1] ?? '').replace(/^./, c => c.toUpperCase())} ${made[2]}.${made[3]}` : model
}

const reachOf = (one: Session): string => (one.kind === 'background' ? `claude attach ${one.id ?? one.sessionId}` : `tab: ${one.name}`)

const ageOf = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))

  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`
}

const textOf = (content: unknown): string => (typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text ?? '').join('') : '')

const durationOf = (ms: number): string => {
  const seconds = Math.round(ms / 1000)

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`
}

// the icon follows the text for the moments whose colour is shared (a commit and a start are both blue), then the colour
const iconOf = (kind: string | undefined, text: string): string =>
  /^(question open|input needed|permission)/.test(text) ? '?' : text.startsWith('committed ') ? '⎇' : text.startsWith('opened PR') ? '⇡' : kind === 'error' ? '✗' : kind === 'success' ? '✓' : '●'

const eventOf = (command: string, result: string, isError: boolean, took?: number): { text: string; kind: string } | null => {
  if (COMMIT.test(command)) {
    const made = result.match(/\[[^\]]+ ([0-9a-f]{7,})\] (.*)/)

    return made ? { text: `committed ${made[1]} ${made[2]}`, kind: BLUE } : null
  }

  if (/\bgh pr create\b/.test(command)) {
    const url = result.match(/\/pull\/(\d+)/)

    return url ? { text: `opened PR #${url[1]}`, kind: BLUE } : null
  }

  if (!RUNNER.test(command)) {
    return null
  }

  const code = isError ? (result.match(/^Exit code (\d+)/)?.[1] ?? '1') : '0'

  return { text: `${command.trim().slice(0, COMMAND_MAX)} · exit ${code}${took === undefined ? '' : ` · ${durationOf(took)}`}`, kind: code === '0' ? 'success' : 'error' }
}

const FLIPS: Record<string, [string, string]> = {
  waiting: ['input needed', 'error'],
  done: ['done', 'success'],
  busy: ['busy', BLUE],
}

const flipOf = (phase: string, quiet: number, question: string): { text: string; kind: string } => {
  const [text, kind] = phase === 'stuck' ? [`no transcript write for ${quiet}m`, 'warning'] : phase === 'waiting' && question ? [`question open: ${question}`, 'error'] : (FLIPS[phase] ?? [phase, GREY])

  return { text, kind }
}

const tookOf = (start: number | undefined, end: unknown): number | undefined => {
  const took = Date.parse(String(end)) - (start ?? NaN)

  return took >= 0 ? took : undefined
}

const touchOf = (tool: string, input: { command?: string; file_path?: string; notebook_path?: string } | undefined): string | null => {
  const path = input?.file_path ?? input?.notebook_path

  return tool === 'Bash' && input?.command ? `$ ${input.command.split('\n')[0]}` : path && ['Edit', 'Write', 'NotebookEdit'].includes(tool) ? `✎ ${path.split('/').pop()}` : null
}

const readTail = (text: string): Pick<Session, 'title' | 'prompt' | 'model' | 'question' | 'events' | 'touches'> => {
  const found = { title: '', prompt: '', model: '', question: '', events: [] as Session['events'], touches: [] as Session['touches'] }
  const commands: Record<string, string> = {}
  const starts: Record<string, number> = {}

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line)

      if (record.type === 'ai-title') {
        found.title = record.aiTitle
      } else if (record.type === 'last-prompt') {
        found.prompt = record.lastPrompt
      } else if (record.type === 'assistant') {
        found.model = record.message.model ?? found.model

        for (const part of record.message.content) {
          const touch = part.type === 'tool_use' ? touchOf(part.name, part.input) : null

          if (touch) {
            found.touches.push({ id: part.id, at: Date.parse(record.timestamp), text: touch })
          }

          if (part.type === 'tool_use' && part.name === 'Bash') {
            commands[part.id] = part.input.command
            starts[part.id] = Date.parse(record.timestamp)
          } else if (part.type === 'tool_use' && part.name === 'AskUserQuestion') {
            found.question = part.input.questions?.[0]?.question ?? found.question
          } else if (part.type === 'text' && part.text?.trim()) {
            found.question = part.text.trim().split('\n')[0]
          }
        }
      } else if (record.type === 'user' && Array.isArray(record.message.content)) {
        for (const part of record.message.content) {
          const event = part.type === 'tool_result' && part.tool_use_id in commands ? eventOf(commands[part.tool_use_id] ?? '', textOf(part.content), part.is_error === true, tookOf(starts[part.tool_use_id], record.timestamp)) : null

          if (event) {
            found.events.push({ id: part.tool_use_id, ...event })
          }
        }
      }
    } catch {
      // the first line of a tail can start mid-record, so it fails to parse and is skipped with any other bad line
    }
  }

  return found
}

const TIERS = ['BLOCKING', 'IMPORTANT', 'SUGGESTION', 'QUESTION', 'NIT']
// github-pr-review sends only these tiers to the verify step; the rest go to cull
const VERIFIED = new Set(['BLOCKING', 'IMPORTANT'])

const readReview = (text: string, sessionId: string): Pick<Session, 'review' | 'reviewTitle' | 'verdict' | 'events'> => {
  const found = { review: '', reviewTitle: '', verdict: '', events: [] as Session['events'] }
  const tiers: Record<string, string> = {}
  const kept: string[] = []
  let findings = 0
  let back = 0
  let index = 0

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line)

      if (record.kind === 'pr') {
        found.reviewTitle = record.title ?? ''
      } else if (record.kind === 'finding') {
        tiers[record.id] = String(record.tier)
        findings += VERIFIED.has(String(record.tier)) ? 1 : 0
      } else if (record.kind === 'verdict') {
        back += VERIFIED.has(tiers[record.id] ?? '') ? 1 : 0

        if (record.kept && record.id in tiers) {
          kept.push(tiers[record.id] ?? '')
        }
      } else if (record.kind === 'step') {
        found.review = record.name
        found.events.push({ id: `${sessionId}-review-${index++}`, text: `step ${record.name}`, kind: BLUE })
      } else if (record.kind === 'done') {
        const counts = TIERS.map(tier => [kept.filter(one => one === tier).length, tier.toLowerCase()] as const).filter(([count]) => count > 0).map(([count, tier]) => ` · ${count} ${tier}`).join('')

        found.verdict = record.verdict
        found.events.push({ id: `${sessionId}-review-${index++}`, text: `verdict ${record.verdict}${counts}`, kind: VERDICTS[record.verdict] ?? BLUE })
      }
    } catch {}
  }

  if (found.review === 'verify') {
    found.review = `verify · ${back} of ${findings} back`
  }

  return found
}

const run = async ($: EngineInterface, argv: string[], cwd?: string): Promise<string> => {
  try {
    return (await $.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS, ...(cwd ? { cwd } : {}) })).stdout
  } catch {
    return ''
  }
}

const listOf = async ($: EngineInterface): Promise<Listed[] | null> => {
  try {
    return JSON.parse(await run($, ['claude', 'agents', '--json']))
  } catch {
    return null
  }
}

const transcript = (home: string, one: { cwd: string; sessionId: string }) =>
  `${home}/.claude/projects/${one.cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${one.sessionId}.jsonl`

const topOf = async ($: EngineInterface, dir: string): Promise<[string, string]> => {
  const [top = '', branch = ''] = (await run($, ['git', '-C', dir, 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'])).trim().split('\n')

  return [top, branch]
}

const checkoutOf = async ($: EngineInterface, home: string, cwd: string, isCoding: boolean): Promise<Pick<Session, 'top' | 'stage'>> => {
  const [top, branch] = await topOf($, cwd)

  if (!isCoding) {
    return { top, stage: '' }
  }

  const plan = await $.fs.read(`${home}/.claude/plans/${top.split('/').pop()}-${branch.replace(/\//g, '-')}.md`).catch(() => '')
  const ticked = plan.match(/^- \[x\] \d+\./gm)?.length ?? 0
  const total = ticked + (plan.match(/^- \[ \] \d+\./gm)?.length ?? 0)

  return { top, stage: total === 0 ? '' : ticked === total ? 'plan done' : `stage ${ticked + 1} of ${total}` }
}

// one warning per git top level holding a plugin dir that is off its default branch or behind its local origin ref (no fetch)
const staleOf = async ($: EngineInterface, home: string): Promise<string[]> => {
  const dirs = ((await $.env.get('CLAUDE_CODE_PLUGIN_DIRS')) ?? '').split(/[:,]/).filter(Boolean).map(dir => dir.replace(/^~/, home))
  const tops = new Map<string, string>()

  for (const dir of dirs) {
    const [top, branch] = await topOf($, dir)

    if (top) {
      tops.set(top, branch)
    }
  }

  const lines: string[] = []

  for (const [top, branch] of tops) {
    const main = (await run($, ['git', '-C', top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim().replace(/^origin\//, '') || 'main'
    const behind = Number((await run($, ['git', '-C', top, 'rev-list', '--count', `HEAD..origin/${main}`])).trim()) || 0
    const repo = top.split('/').pop()

    if (branch !== main) {
      lines.push(`⚠ mods load from ${repo} on ${branch}, not ${main}`)
    } else if (behind > 0) {
      lines.push(`⚠ mods load from ${repo} on ${branch}, ${behind} behind origin/${main}`)
    }
  }

  return lines
}

const CHECKOUTS = 'checkouts'

// today's counts; each source is read alone so a failed one counts 0, and the checkouts used today are remembered in the store under the local date
const tallyOf = async ($: EngineInterface, home: string, tops: string[], now: number): Promise<{ commits: number; prs: number; reviews: number }> => {
  const day = new Date(now)
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const date = day.toLocaleDateString('en-CA')
  const stored = (await $.store.get(CHECKOUTS).catch(() => undefined)) as { date: string; tops: string[] } | undefined
  const used = [...new Set([...(stored?.date === date ? stored.tops : []), ...tops.filter(Boolean)])]

  if (stored?.date !== date || used.length !== stored.tops.length) {
    await $.store.set(CHECKOUTS, { date, tops: used }).catch(() => undefined)
  }

  const email = (await run($, ['git', 'config', 'user.email'])).trim()
  const hashes = new Set<string>()

  for (const top of email ? used : []) {
    for (const entry of (await run($, ['git', '-C', top, 'log', `--since=${midnight.toISOString()}`, `--author=${email}`, '--oneline', '--all'])).split('\n')) {
      hashes.add(entry.split(' ')[0] ?? '')
    }
  }

  hashes.delete('')

  let prs = 0

  try {
    prs = JSON.parse(await run($, ['gh', 'search', 'prs', '--author=@me', `--created=>=${midnight.toISOString()}`, '--json', 'number'])).length
  } catch {}

  const reviews = Number((await run($, ['sh', '-c', 'find "$1" -name "*.jsonl" -newermt "$2" -exec grep -l \'"kind":"done"\' {} + | wc -l', 'sh', `${home}/.claude/reviews`, `${date} 00:00:00`])).trim()) || 0

  return { commits: hashes.size, prs, reviews }
}

const FAILED = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ERROR'])
const CI_MARKS = { pass: ['✓', 'success'], fail: ['✗', 'error'], run: ['●', BLUE] } as const

const ciText = (ci: Ci): string => `CI ${CI_MARKS[ci.state][0]}${ci.state === 'fail' ? ` ${ci.failing.length} failing` : ci.state === 'run' ? ' running' : ''}`

const ciWordsOf = (ci: Ci): string => `PR #${ci.number} CI ${ci.state === 'pass' ? 'passing' : ci.state === 'fail' ? `failing: ${ci.failing.join(', ')}` : 'running'}`

const ciOf = async ($: EngineInterface, cwd: string, number: number | undefined, now: number): Promise<Pick<Session, 'ci' | 'ciFlip'>> => {
  const key = `${cwd}#${number ?? ''}`
  const cached = (await read($, checks))[key]

  if (cached && now - cached.at < CHECK_MS) {
    return { ci: cached.ci, ciFlip: false }
  }

  let ci: Ci | null = null

  try {
    const pr = JSON.parse(await run($, ['gh', 'pr', 'view', ...(number === undefined ? [] : [String(number)]), '--json', 'number,statusCheckRollup'], cwd))
    const rollup: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[] = pr.statusCheckRollup ?? []
    const failing = rollup.filter(check => FAILED.has(check.conclusion ?? check.state ?? '')).map(check => check.name ?? check.context ?? '')
    const isRunning = rollup.some(check => (check.status ? check.status !== 'COMPLETED' : check.state === 'PENDING'))

    if (rollup.length > 0) {
      ci = { number: pr.number, state: isRunning ? 'run' : failing.length > 0 ? 'fail' : 'pass', failing }
    }
  } catch {
    // no PR for the branch makes gh exit non-zero with no JSON
  }

  await update($, checks, kept => ({ ...kept, [key]: { at: now, ci } }))

  return { ci, ciFlip: cached !== undefined && ci !== null && ci.state !== 'run' && cached.ci?.state !== ci.state }
}

const refresh = async ($: EngineInterface) => {
  const listed = await listOf($)

  if (!listed) {
    return
  }

  const self = await $.session.id()
  const home = await homeOf($)
  const now = await $.clock.now()
  const built = await Promise.all(
    listed
      .filter(one => one.sessionId !== self)
      .map(async one => {
        try {
          const path = transcript(home, one)
          const mtimeMs = await $.fs.stat(path).then(stat => stat.mtimeMs, () => 0)

          const tail = readTail(await run($, ['tail', '-c', TAIL_BYTES, path]))
          const target = one.name.match(REVIEW)
          const sidecar = target ? readReview(await run($, ['sh', '-c', 'cat "$1"/*-"$2"-"$3".jsonl', 'sh', `${home}/.claude/reviews`, target[2] ?? '', String(Number(target[1]))]), one.sessionId) : { review: '', reviewTitle: '', verdict: '', events: [] }

          const { top, stage } = await checkoutOf($, home, one.cwd, !target)
          const live: Live = await $.fs.read(liveOf(home, one.sessionId)).then(text => JSON.parse(text)).catch(() => ({}))

          return { ...one, mtimeMs, top, stage, ...live, ...tail, ...sidecar, events: [...tail.events, ...sidecar.events] }
        } catch {
          // keep the row in its lane from what claude agents listed, so a session that needs you stays in sight
          return { ...one, cwd: one.cwd ?? '', mtimeMs: 0, top: '', stage: '', ...readTail(''), title: "couldn't load", review: '', reviewTitle: '', verdict: '', events: [] }
        }
      }),
  )

  const rows: Session[] = []

  // in turn, so two sessions on one checkout read the cache the first filled
  for (const one of built) {
    const target = one.name.match(REVIEW)

    rows.push({ ...one, ...(await ciOf($, one.cwd, target ? Number(target[1]) : undefined, now)) })
  }

  if (now - (await read($, stale)).at >= CHECK_MS) {
    await update($, stale, kept => ({ ...kept, at: now }))
    const lines = await staleOf($, home)
    await update($, stale, () => ({ at: now, lines }))
  }

  if (now - (await read($, tally)).at >= CHECK_MS) {
    await update($, tally, kept => ({ ...kept, at: now }))
    const counts = await tallyOf($, home, rows.map(one => one.top), now)
    await update($, tally, () => ({ at: now, ...counts }))
  }

  const prior = await read($, phases)
  const current = Object.fromEntries(rows.map(one => [one.sessionId, phaseOf(one, now)]))
  const priorSeen = await read($, seen)
  const found = rows.flatMap(one => one.events.map(event => ({ ...event, agent: agentOf(one) })))
  const touched = rows.flatMap(one => one.touches.map(touch => ({ ...touch, agent: agentOf(one) })))
  const priorFed = await read($, fed)

  // the first poll only learns the ids, so the backlog in each tail never reaches the feed
  if (priorFed) {
    const fresh = touched.filter(touch => !priorFed.includes(touch.id)).sort((a, b) => b.at - a.at)

    await update($, activity, kept => [...fresh.map(({ at, agent, text }) => ({ at, agent, text })), ...kept].slice(0, FEED_MAX))
  }

  await update($, fed, () => touched.map(touch => touch.id))

  if (prior) {
    const changed = rows.filter(one => current[one.sessionId] !== prior[one.sessionId])

    for (const one of changed) {
      if (polling && (current[one.sessionId] === 'waiting' || current[one.sessionId] === 'stuck')) {
        await $.ui.notify(current[one.sessionId] === 'waiting' ? `${one.name} is waiting for you` : `${one.name} looks stuck: quiet ${quietOf(one, now)}m`, { title: 'mission-control' }).catch(() => undefined)
      }
    }

    const listed = await read($, sessions)
    const events = [
      ...changed
        .filter(one => !(TURN.has(prior[one.sessionId] ?? '') && TURN.has(current[one.sessionId] ?? '')))
        .map(one => ({ agent: agentOf(one), ...(one.sessionId in prior ? flipOf(current[one.sessionId] ?? '', quietOf(one, now), one.question) : { text: 'started', kind: BLUE }) })),
      ...listed.filter(one => !(one.sessionId in current)).map(one => ({ agent: agentOf(one), text: 'ended', kind: GREY })),
      ...found.filter(event => !priorSeen?.includes(event.id)),
      ...rows.flatMap(one => (one.ci && one.ciFlip ? [{ agent: agentOf(one), text: `PR #${one.ci.number} CI ${one.ci.state === 'pass' ? 'passed' : `failed: ${one.ci.failing.join(', ')}`}`, kind: one.ci.state === 'pass' ? 'success' : 'error' }] : [])),
    ]

    await update($, highlights, kept => [...events.map(({ agent, text, kind }) => ({ at: now, agent, text, kind })).reverse(), ...kept].slice(0, HIGHLIGHTS_MAX))
  }

  await update($, seen, () => found.map(event => event.id))
  await update($, phases, () => current)
  await update($, sessions, () => rows)
  await update($, told, () => ({}))
}

let asking: Asking | null = null
const calls = new Map<string, Call>()
let allowOnce: string | null = null

const permissionOf = () => {
  const open = [...calls.values()].find(one => one.detail !== undefined)

  return open && { tool: open.tool, detail: open.detail }
}

const isWaiting = async ($: EngineInterface): Promise<boolean> => {
  const self = await $.session.id()

  return ((await listOf($)) ?? []).some(one => one.sessionId === self && one.status === 'waiting')
}

let polling: Timer | null = null
let isPolling = false

const poll = ($: EngineInterface) => {
  polling ??= $.clock.every(PERIOD_MS, async () => {
    // a run can outlast a period, and two polls beside each other would read the same prior state and alert twice
    if (isPolling) {
      return
    }

    isPolling = true

    try {
      await refresh($)
    } finally {
      isPolling = false
    }
  })
}

const STATUS_TOOL = 'mission_status'
const STATUS_MAX = 10

const statusOf = (rows: Session[], feed: Highlight[], now: number): string => {
  const lines = LANES.flatMap((name, lane) => {
    const inLane = rows.filter(one => laneOf(one, now) === lane)
    const entries = inLane.map(one => {
      const phase = phaseOf(one, now)
      const running = runningOf(one, now)
      const review = one.verdict || one.review.replace(' · ', ' ').replace(/ back$/, '')
      const task = phase === 'waiting' ? (one.permission ? `permission: ${one.permission.tool}` : one.ask ? `question: ${one.ask.question}` : 'input needed') : running || (one.review ? '' : taskOf(one))
      const details = [task, one.review ? '' : one.stage, one.ci ? ciWordsOf(one.ci) : '', one.context === undefined ? '' : `ctx ${one.context}%`, ageOf(now - (one.mtimeMs || one.startedAt))].filter(Boolean)

      return `${agentOf(one)}${review ? ` ${review}` : ''}${details.length ? ` (${details.join(', ')})` : ''}`
    })

    return inLane.length ? [`${name}: ${entries.join(', ')}`] : []
  })

  return [...lines, ...feed.slice(0, STATUS_MAX).map(item => `Recent: ${clock(item.at)} ${item.agent ?? ''} ${item.text}`)].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mission-control', description: 'Show the other Claude Code sessions in a pane' })
    await $.tool.register({ name: STATUS_TOOL, description: 'Summarise the other Claude Code sessions: which need the user, which are coding or reviewing, their context, CI and the latest highlights.', isDeferred: false })

    if (await read($, isOpen)) {
      poll($)
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await report($, { context: e.context.percent, window: e.context.window })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    let kind: 'allow' | 'deny' | undefined
    const decided = new Promise<null>(resolve => {
      if (isMain) {
        calls.set(e.tool_use_id, {
          tool: e.tool,
          decide: picked => {
            kind = picked
            resolve(null)
          },
        })
      }
    })

    if (isMain) {
      await report($, { running: { tool: e.tool, ...(e.tool === 'Bash' ? { command: e.command } : {}), since: await $.clock.now() } })
    }

    try {
      const raced = await Promise.race([next(e), decided])

      if (raced === null && kind === 'deny') {
        return { deny: 'Denied from Mission Control' }
      }

      if (raced === null) {
        allowOnce = calls.get(e.tool_use_id)?.key ?? null
      }

      const { tool_use_id, agentId, ...args } = e
      const ran = raced ?? (await $.tool.call(args as ToolCallArgs))
      const token = await readToken($)

      return token && ran.text?.includes(token) ? { deny: 'Mission Control withheld a result that holds its token' } : ran
    } finally {
      if (isMain) {
        if (allowOnce === calls.get(e.tool_use_id)?.key) {
          allowOnce = null
        }

        calls.delete(e.tool_use_id)
        await report($, { running: undefined, permission: permissionOf() })
      }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Mission Control could not check this call' }))

  on('tool.check', async ($, e, next) => {
    const key = `${e.tool}${JSON.stringify(e.input)}`

    if (allowOnce === key) {
      allowOnce = null

      return { decision: 'allow' }
    }

    const verdict = await next(e)
    const call = calls.get(e.tool_use_id ?? '')

    if (verdict.decision === 'ask' && call) {
      const input = e.input as { command?: string; file_path?: string }

      call.detail = input.command ?? input.file_path ?? JSON.stringify(input)
      call.key = key
      await report($, { permission: permissionOf() })
    }

    return verdict
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const { questions } = e
    const answers: Record<string, string> = {}
    let settle = () => {}
    const answered = new Promise<null>(resolve => (settle = () => resolve(null)))

    asking = { questions, answers, settle }
    await report($, { ask: askOf(asking) })

    try {
      return (await Promise.race([next(e), answered])) ?? { result: { questions, answers } }
    } finally {
      asking = null
      await report($, { ask: undefined })
    }
  })

  on('tool.call', { tool: `mcp__mission-control__${STATUS_TOOL}` }, async $ => {
    if (!polling) {
      await refresh($)
    }

    return { result: statusOf(await read($, sessions), await read($, highlights), await $.clock.now()) }
  })

  on('session.send', { origin: { kind: 'model' } }, async ($, e, next) => {
    const token = await readToken($)

    return (token && e.text.includes(token)) || parsedOf(e.text)?.mc !== undefined ? { isDelivered: false, reason: 'Only the Mission Control pane sends pane messages' } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { isDelivered: false, reason: 'Mission Control could not check this message' }))

  on('session.receive', { origin: { kind: 'peer', plugin: 'mission-control' } }, async ($, e, next) => {
    const message = await verified($, e.text)
    const open = asking

    if (!message) {
      return next(e)
    }

    const { kind, text } = message

    if (kind === 'allow' || kind === 'deny') {
      const call = [...calls.values()].find(one => one.detail !== undefined && one.detail === text)

      // a prompt answered at the session leaves its call running, and deciding it then would abort that run
      if (call && (await isWaiting($))) {
        call.decide(kind)
      }
    } else if (kind === 'prompt' && text) {
      // awaiting the engine's own submit inside a receive turn hangs, so it runs on its own
      void $.prompt.submit({ text }).catch(() => undefined)
    } else if (kind === 'answer' && open && text !== undefined) {
      const target = open.questions[message.question ?? askOf(open)?.index ?? -1]

      if (target) {
        open.answers[target.question] = text

        const ask = askOf(open)

        if (ask) {
          await report($, { ask })
        } else {
          open.settle()
        }
      }
    }

    return { consumed: 'Mission Control took a pane message' }
  })

  on('session.end', async ($, e, next) => {
    await run($, ['rm', '-f', liveOf(await homeOf($), e.sessionId)])

    return next(e)
  })

  on('command.run', { command: 'mission-control' }, async $ => {
    const { isPlaced } = await $.ui.open(OPEN)

    await update($, isOpen, () => true)

    try {
      await refresh($)
    } finally {
      poll($)
    }

    return { text: isPlaced ? 'Mission control is in the pane.' : 'Widen the terminal to place the pane.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'unload') {
      polling?.cancel()
      polling = null
      await update($, isOpen, () => false)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Input = 'Input' in elements ? elements.Input : null
    const rows = await read($, sessions)
    const opened = await read($, expanded)
    const now = await $.clock.now()
    const home = await homeOf($)
    const feed = await read($, highlights)
    const touches = await read($, activity)
    const warnings = (await read($, stale)).lines
    const today = await read($, tally)
    const notes = await read($, told)
    const who = Math.min(NAME, Math.max(0, ...feed.map(item => (item.agent ?? '').length)))
    const touchWho = Math.min(NAME, Math.max(0, ...touches.map(item => (item.agent ?? '').length)))
    const lanes = LANES.map((_, lane) => rows.filter(one => laneOf(one, now) === lane))
    const ordered = lanes.flat()
    const tallied = `${plural(rows.length, 'agent')} · today ${plural(today.commits, 'commit')} · ${plural(today.prs, 'PR')} · ${plural(today.reviews, 'review')}`
    const matesOf = (one: Session) => (one.top ? rows.filter(other => other.top === one.top && other !== one) : [])
    const sharesOf = (one: Session, mates: Session[]) => (mates.length ? `${one.top.split('/').pop()} with ${mates.map(shortOf).join(', ')}` : '')
    const cwdOf = (one: Session) => (home && one.cwd.startsWith(home) ? `~${one.cwd.slice(home.length)}` : one.cwd)
    const toggle = (one: Session) => () => void update($, expanded, current => (current === one.sessionId ? null : one.sessionId))
    const laneHead = (inLane: Session[], lane: number) => (
      <Box gap={1}>
        <Text bold color={lane === 0 ? 'error' : GREY}>{LANES[lane]}</Text>
        <Text color="text">{String(inLane.length)}</Text>
      </Box>
    )

    const send = async (one: Session, body: Omit<Message, 'mc'>, toast: string, note: string) => {
      const sent = await $.session.send({ to: { sessionId: one.sessionId }, text: JSON.stringify({ mc: await tokenOf($), ...body }) })

      $.ui.toast(sent.isDelivered ? `${toast} ${shortOf(one)}` : `Not sent: ${sent.reason}`)

      if (sent.isDelivered) {
        await update($, told, kept => ({ ...kept, [one.sessionId]: note }))
      }
    }

    const settle = (one: Session, kind: 'allow' | 'deny') => send(one, { kind, text: one.permission?.detail }, kind === 'allow' ? 'Allowed' : 'Denied', kind === 'allow' ? 'Allowed once.' : 'Denied.')
    const answer = (one: Session, text: string) => send(one, { kind: 'answer', text, question: one.ask?.index }, 'Answered', `Sent "${text}".`)
    const prompt = (one: Session, text: string) => send(one, { kind: 'prompt', text }, 'Prompted', `Sent "${text}".`)

    if (rows.length === 0 && feed.length === 0) {
      return <Text color={GREY}>no other sessions</Text>
    }

    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : null

    if (Svg) {
      const isMobile = e.surface === 'mobile'
      const svg = (size: number, alt: string, body: string) => <Svg width={size} height={size} alt={alt} source={`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`} />
      const hexOf: Record<string, string> = { busy: BLUE, waiting: RED, stuck: AMBER, idle: GREY, done: GREEN }
      const windowOf = (size: number) => (size >= 1_000_000 ? `${size / 1_000_000}M` : `${Math.round(size / 1000)}k`)
      const field = (label: string, content: RenderChildren) => (
        <Box>
          <Box width={LABEL} flexShrink={0}>
            <Text color={GREY}>{label}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            {content}
          </Box>
        </Box>
      )
      const shown = isMobile ? feed.slice(0, MOBILE_HIGHLIGHTS) : feed

      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold>MISSION CONTROL</Text>
            <Text color={GREY}>{tallied}</Text>
          </Box>
          {warnings.map(warning => (
            <Text color="warning">{warning}</Text>
          ))}
          {lanes.map(
            (inLane, lane) =>
              inLane.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {laneHead(inLane, lane)}
                  {inLane.map(one => {
                    const phase = phaseOf(one, now)
                    const [task, taskColor] = headlineOf(one, phase, quietOf(one, now), runningOf(one, now))
                    const mates = matesOf(one)
                    const percent = one.context
                    const radius = 7
                    const arc = (2 * Math.PI * radius * (percent ?? 0)) / 100
                    const isOpened = opened === one.sessionId
                    const note = notes[one.sessionId]
                    const glyph = hexOf[phase] ?? GREY
                    const ciWords = one.ci ? ciText(one.ci) : ''

                    return (
                      <Box flexDirection="column">
                        <Box key={`row-${one.sessionId}`} gap={1} paddingX={1} hover={{ backgroundColor: SHADE }} {...(isOpened ? { backgroundColor: SHADE } : {})}>
                          {svg(14, phase, phase === 'done' ? `<path d="M3 7.5l2.6 2.6L11 4.5" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : `<circle cx="7" cy="7" r="5" fill="${phase === 'idle' ? 'none' : glyph}" stroke="${glyph}" stroke-width="1.6"/>`)}
                          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                            <Button plain key={`session-${one.sessionId}`} onPress={toggle(one)}>
                              <Text>{shortOf(one)}</Text>
                              {mates.length > 0 && <Text color="warning">{` ×${mates.length + 1}`}</Text>}
                              {!isMobile && <Text color={GREY}>{` ${modelOf(one.model)}`}</Text>}
                            </Button>
                            <Box gap={1}>
                              <Text bold={one.verdict !== ''} color={taskColor} wrap="truncate-end">{task}</Text>
                              {one.ci && <Text color={GREY}>·</Text>}
                              {one.ci && <Text color={CI_MARKS[one.ci.state][1]}>{ciWords}</Text>}
                            </Box>
                          </Box>
                          <Box gap={1} flexShrink={0}>
                            {svg(18, percent === undefined ? 'context unknown' : `context ${percent}%`, `<circle cx="9" cy="9" r="${radius}" fill="none" stroke="${LINE}" stroke-width="2.5"/>${percent === undefined ? '' : `<circle cx="9" cy="9" r="${radius}" fill="none" stroke="${fillOf(percent, [GREY, AMBER, RED])}" stroke-width="2.5" stroke-dasharray="${arc.toFixed(1)} ${(2 * Math.PI * radius).toFixed(1)}" transform="rotate(-90 9 9)" stroke-linecap="round"/>`}`)}
                            <Text color={GREY}>{ageOf(now - (one.mtimeMs || one.startedAt))}</Text>
                          </Box>
                        </Box>
                        {isOpened && (
                          <Box flexDirection="column" paddingLeft={4} paddingRight={1} paddingBottom={1} backgroundColor={SHADE}>
                            {phase === 'waiting' && one.ask && field('ask', <Text wrap="wrap">{one.ask.question}</Text>)}
                            {phase === 'waiting' && one.ask && !note && (
                              <Box gap={1} flexWrap="wrap">
                                {one.ask.options.slice(0, 4).map((option, at) => (
                                  <Button key={`option-${one.sessionId}-${at}`} label={option} onPress={() => void answer(one, option)} />
                                ))}
                              </Box>
                            )}
                            {phase === 'waiting' && one.ask && !note && !isMobile && Input && field('reply', <Input key={`reply-${one.sessionId}`} placeholder="Type an answer, Enter to send" onSubmit={(text: string) => void answer(one, text)} />)}
                            {phase === 'waiting' && one.permission && field('asks', <Text mono wrap="wrap">{one.permission.detail}</Text>)}
                            {phase === 'waiting' && one.permission && !note && (
                              <Box gap={1}>
                                <Button key={`allow-${one.sessionId}`} onPress={() => void settle(one, 'allow')}>
                                  <Text color="success">Allow once</Text>
                                </Button>
                                <Button key={`deny-${one.sessionId}`} onPress={() => void settle(one, 'deny')}>
                                  <Text color="error">Deny</Text>
                                </Button>
                              </Box>
                            )}
                            {phase === 'idle' && !note && !isMobile && Input && field('reply', <Input key={`reply-${one.sessionId}`} placeholder="New instruction, Enter to send" onSubmit={(text: string) => void prompt(one, text)} />)}
                            {note && <Text color="success">{note}</Text>}
                            {percent !== undefined && field('ctx', <Text>{one.window ? `${percent}% of ${windowOf(one.window)} · ${modelOf(one.model)}` : `${percent}%`}</Text>)}
                            {[
                              ['task', [one.reviewTitle || one.title, one.review ? '' : one.stage].filter(Boolean).join(' · ')],
                              ['ci', one.ci ? ciWordsOf(one.ci) : ''],
                              ['shares', sharesOf(one, mates)],
                              ['cwd', cwdOf(one)],
                              ['jump', reachOf(one)],
                            ]
                              .filter(([, value]) => value)
                              .map(([label = '', value]) => field(label, <Text wrap="wrap">{value}</Text>))}
                          </Box>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              ),
          )}
          <Text color={GREY}>{'╌'.repeat(e.props.bodyColumns)}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={GREY}>HIGHLIGHTS</Text>
            {shown.length === 0 && <Text color={GREY}>nothing yet</Text>}
            {shown.map(item => (
              <Box gap={1} {...(now - item.at < PERIOD_MS ? { backgroundColor: SHADE } : {})}>
                <Box width={CLOCK - 1} flexShrink={0}>
                  <Text color={GREY}>{clock(item.at)}</Text>
                </Box>
                <Box width={ICON - 1} flexShrink={0}>
                  <Text color={item.kind ?? BLUE}>{iconOf(item.kind, item.text)}</Text>
                </Box>
                <Box width={who} flexShrink={0}>
                  <Text wrap="truncate-end">{item.agent ?? ''}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text color={item.kind ?? BLUE} wrap="truncate-end">{item.text}</Text>
                </Box>
              </Box>
            ))}
          </Box>
          {!isMobile && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color={GREY}>FEED</Text>
              {touches.length === 0 && <Text color={GREY}>nothing yet</Text>}
              {touches.map(item => (
                <Box gap={1}>
                  <Box width={CLOCK - 1} flexShrink={0}>
                    <Text color={GREY}>{clock(item.at)}</Text>
                  </Box>
                  <Box width={touchWho} flexShrink={0}>
                    <Text color={GREY} wrap="truncate-end">{item.agent ?? ''}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text mono color={GREY} wrap="truncate-end">{item.text}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const field = (label: string, content: RenderChildren) => (
      <Box>
        <Text color={GREY}>{label.padEnd(LABEL)}</Text>
        {content}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>{`MISSION CONTROL · ${tallied}`}</Text>
          <Text color={GREY}>/mission-control</Text>
        </Box>
        {warnings.map(warning => (
          <Text color="warning">{warning}</Text>
        ))}
        {lanes.map(
          (inLane, lane) =>
            inLane.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {laneHead(inLane, lane)}
                {inLane.map(one => {
                  const at = ordered.indexOf(one)
                  const hotkey = at < 9 ? String(at + 1) : null
                  const phase = phaseOf(one, now)
                  const [glyph, color] = MARKS[phase as keyof typeof MARKS] ?? ['○', GREY]
                  const quiet = quietOf(one, now)
                  const running = runningOf(one, now)

                  const isVerdict = one.verdict !== ''
                  const [task, taskColor] = headlineOf(one, phase, quiet, running)
                  const [ctx, ctxColor] = ctxOf(one.context)

                  const width = Math.max(1, e.props.bodyColumns - FIXED)
                  const stage = phase === 'waiting' || quiet > 0 || running || one.review || !one.stage ? '' : ` · ${one.stage}`
                  const ci = one.ci ? ` · ${ciText(one.ci)}` : ''
                  const main = fit(task, width - stage.length - ci.length).trimEnd()
                  const mates = matesOf(one)
                  const note = notes[one.sessionId]

                  return (
                    <Box flexDirection="column">
                      <Button plain key={`session-${one.sessionId}`} {...(hotkey ? { hotkey } : {})} onPress={toggle(one)}>
                        {!hotkey && <Text>{'   '}</Text>}
                        <Text color={color}>{`${glyph} `}</Text>
                        <Text>{`${fit(shortOf(one), mates.length ? NAME - SHARE : NAME)} `}</Text>
                        {mates.length > 0 && <Text color="warning">{`×${mates.length + 1}`.padEnd(SHARE - 1)} </Text>}
                        <Text color={GREY}>{`${fit(modelOf(one.model), MODEL)} `}</Text>
                        <Text color={ctxColor}>{`${ctx.padEnd(CTX)} `}</Text>
                        {(stage || ci) && <Text bold={isVerdict} color={taskColor}>{main}</Text>}
                        {stage && <Text color={GREY}>{ci ? stage : `${stage.padEnd(width - main.length)} `}</Text>}
                        {ci && one.ci && <Text color={CI_MARKS[one.ci.state][1]}>{`${ci.padEnd(width - main.length - stage.length)} `}</Text>}
                        {!stage && !ci && <Text bold={isVerdict} color={taskColor}>{`${fit(task, width)} `}</Text>}
                        <Text color={GREY}>{ageOf(now - (one.mtimeMs || one.startedAt)).padStart(AGE)}</Text>
                      </Button>
                      {opened === one.sessionId && (
                        <Box flexDirection="column" paddingLeft={DETAIL_INDENT} backgroundColor={SHADE}>
                          {[
                            ['task', one.reviewTitle || one.title],
                            ['last', phase === 'waiting' ? one.question || one.prompt : one.prompt],
                            ['shares', sharesOf(one, mates)],
                            ['cwd', cwdOf(one)],
                            ['jump', reachOf(one)],
                          ]
                            .filter(([, value]) => value)
                            .map(([label = '', value = '']) => field(label, <Text color="text" wrap="truncate-end">{value.replace(/\s+/g, ' ').trim()}</Text>))}
                          {phase === 'waiting' && one.permission && (
                            <Box flexDirection="column">
                              {field('asks', <Text color="text" wrap="wrap">{one.permission.detail}</Text>)}
                              <Box gap={1}>
                                <Button key={`allow-${one.sessionId}`} hotkey="y" onPress={() => void settle(one, 'allow')}>
                                  <Text>[y] Allow once</Text>
                                </Button>
                                <Button key={`deny-${one.sessionId}`} hotkey="n" onPress={() => void settle(one, 'deny')}>
                                  <Text>[n] Deny</Text>
                                </Button>
                              </Box>
                            </Box>
                          )}
                          {phase === 'waiting' && one.ask && (
                            <Box flexDirection="column">
                              {field('ask', <Text color="text" wrap="wrap">{one.ask.question}</Text>)}
                              <Box gap={1}>
                                {one.ask.options.slice(0, 4).map((option, at) => (
                                  <Button key={`option-${one.sessionId}-${at}`} hotkey={'abcd'[at] ?? ''} onPress={() => void answer(one, option)}>
                                    <Text>{`[${'abcd'[at]}] ${option}`}</Text>
                                  </Button>
                                ))}
                              </Box>
                              {Input && <Input key={`reply-${one.sessionId}`} label="reply" onSubmit={(text: string) => void answer(one, text)} />}
                            </Box>
                          )}
                          {phase === 'idle' && Input && <Input key={`reply-${one.sessionId}`} label="reply" onSubmit={(text: string) => void prompt(one, text)} />}
                          {note && <Text color="success">{note}</Text>}
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Box>
            ),
        )}
        <Text color={GREY}>{'╌'.repeat(e.props.bodyColumns)}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={GREY}>HIGHLIGHTS</Text>
          {feed.length === 0 && <Text color={GREY}>nothing yet</Text>}
          {feed.map(item => (
            <Box {...(now - item.at < PERIOD_MS ? { backgroundColor: SHADE } : {})}>
              <Text color={GREY}>{clock(item.at).padEnd(CLOCK)}</Text>
              <Text color={item.kind ?? BLUE}>{`${iconOf(item.kind, item.text)} `}</Text>
              <Text>{`${fit(item.agent ?? '', who)} `}</Text>
              <Text color={item.kind ?? BLUE}>{fit(item.text, Math.max(1, e.props.bodyColumns - CLOCK - ICON - who - 1)).trimEnd()}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={GREY}>FEED</Text>
          {touches.length === 0 && <Text color={GREY}>nothing yet</Text>}
          {touches.map(item => (
            <Box>
              <Text color={GREY}>{clock(item.at).padEnd(CLOCK)}</Text>
              <Text color={GREY}>{`${fit(item.agent ?? '', touchWho)} `}</Text>
              <Text color={GREY}>{fit(item.text, Math.max(1, e.props.bodyColumns - CLOCK - touchWho - 1)).trimEnd()}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
