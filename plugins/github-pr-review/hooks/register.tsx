import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, Timer } from 'claude-code'

import type { Agent, Check, Pr, ReviewLine } from '../types'

const PANE = 'github-pr-review'
const FILL = 'permission'
const LABEL_WIDTH = 10
const GH_TIMEOUT_MS = 10000
const PERIOD_MS = 30000
const IDLE_PERIODS = 5
const GRACE_PERIODS = 4
const TICK_MS = 1000
const IDLE_TICKS = 5
const SPINE_WIDTH = 3
const MARK_WIDTH = 2
const STEP_WIDTH = 13
const TAG_WIDTH = 10
const LOC_WIDTH = 16
const HOTKEY_WIDTH = 3
const DETAIL_ROWS = 3
const TIME_WIDTH = 6
const PR_URL = /https:\/\/github\.com\/\S+?\/pull\/\d+/
const REVIEWS = /\/\.claude\/reviews\/([\w.-]+\.jsonl)/
const REVIEW_KINDS = new Set(['pr', 'step', 'finding', 'verdict', 'mutant', 'done'])
const STEPS = ['fetch', 'analyse', 'prove', 'verify', 'cull', 'report']
const TIERS = ['BLOCKING', 'IMPORTANT', 'SUGGESTION', 'NIT', 'QUESTION']
const TIER_COLORS: Record<string, string> = { BLOCKING: 'error', IMPORTANT: 'warning' }
const LABELS: Record<string, string> = { prove: 'prove tests' }
const VERDICTS: Record<string, string> = { APPROVED: 'success', COMMENT: 'warning', 'CHANGES REQUESTED': 'error' }
const MARKS = {
  done: ['✓ ', { color: 'success' }],
  running: ['● ', { color: FILL }],
  pending: ['○ ', { dimColor: true }],
  skipped: ['– ', { dimColor: true }],
} as const
const NAMES = { done: {}, running: { weight: 'semibold' }, pending: { dimColor: true }, skipped: { dimColor: true } } as const
const OPEN = { id: PANE, title: 'Pull request', columns: 60 }

const ROW_HEIGHT = 30
const VIEW_WIDTH = 400
const TIMELINE_STYLE =
  ':root{--line:#e3dcd3;--fg:#2a2521;--muted:#786e65;--accent:#b35a00;--green:#3d7a3a}' +
  '@media (prefers-color-scheme:dark){:root{--line:#332e29;--fg:#ebe4db;--muted:#9c9187;--accent:#ff8f40;--green:#9ccc7a}}' +
  '.rail{stroke:var(--line);stroke-width:2}.fill{stroke:var(--green);stroke-width:2}' +
  '.done{fill:var(--green)}.ring{fill:none;stroke:var(--accent);stroke-width:2}.dot{fill:var(--accent)}.hollow{fill:none;stroke:var(--muted);stroke-width:1.5}' +
  'text{font:13px system-ui,sans-serif;fill:var(--fg)}.dim{fill:var(--muted)}.running{fill:var(--accent)}.bold{font-weight:700}'

type TimelineRow = { name: string; state: keyof typeof MARKS; detail: string; time: string }

const xml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const timelineSvg = (steps: TimelineRow[]): string => {
  const y = (at: number) => at * ROW_HEIGHT + ROW_HEIGHT / 2
  const reached = steps.findIndex(({ state }) => state === 'running')
  const filled = reached === -1 ? steps.findLastIndex(({ state }) => state === 'done') : reached
  const marks = steps.map(({ name, state, detail, time }, at) => {
    const node =
      state === 'done'
        ? `<circle class="done" cx="10" cy="${y(at)}" r="5"/>`
        : state === 'running'
          ? `<circle class="ring" cx="10" cy="${y(at)}" r="6"/><circle class="dot" cx="10" cy="${y(at)}" r="2.5"/>`
          : `<circle class="hollow" cx="10" cy="${y(at)}" r="5"/>`
    const tone = state === 'pending' || state === 'skipped' ? ' class="dim"' : state === 'running' ? ' class="bold"' : ''

    return (
      `${node}<text${tone} x="28" y="${y(at) + 4}">${xml(name)}</text>` +
      `<text class="dim" x="130" y="${y(at) + 4}">${xml(detail)}</text>` +
      `<text class="${state === 'running' ? 'running' : 'dim'}" x="${VIEW_WIDTH - 8}" y="${y(at) + 4}" text-anchor="end">${xml(time)}</text>`
    )
  })
  const fill = filled > 0 ? `<line class="fill" x1="10" y1="${y(0)}" x2="10" y2="${y(filled)}"/>` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} ${steps.length * ROW_HEIGHT}"><style>${TIMELINE_STYLE}</style>` +
    `<line class="rail" x1="10" y1="${y(0)}" x2="10" y2="${y(steps.length - 1)}"/>${fill}${marks.join('')}</svg>`
  )
}

const repo = atom({ plugin: 'github-pr-review', key: 'repo' } as const, '')
const pr = atom({ plugin: 'github-pr-review', key: 'pr' } as const, null as Pr | null)
const checks = atom({ plugin: 'github-pr-review', key: 'checks' } as const, null as Check[] | null)
const notified = atom({ plugin: 'github-pr-review', key: 'notified' } as const, [] as string[])
const followed = atom({ plugin: 'github-pr-review', key: 'followed' } as const, null as string | null)
const review = atom({ plugin: 'github-pr-review', key: 'review' } as const, [] as ReviewLine[])
const stamps = atom({ plugin: 'github-pr-review', key: 'stamps' } as const, [] as number[])
const fleet = atom({ plugin: 'github-pr-review', key: 'fleet' } as const, [] as Agent[])
const expanded = atom({ plugin: 'github-pr-review', key: 'expanded' } as const, null as number | null)

const isFailed = (one: Check) => one.bucket === 'fail' || one.bucket === 'cancel'
const isPending = (one: Check) => one.bucket === 'pending'

// `gh pr checks` prints its JSON array whether it exits 0, 1 or 8, so the exit code is not read.
const ghJson = async ($: EngineInterface, args: string[]): Promise<unknown> => {
  try {
    return JSON.parse((await $.process.run(['gh', ...args], { timeoutMs: GH_TIMEOUT_MS })).stdout)
  } catch {
    return null
  }
}

const findPr = async ($: EngineInterface, url?: string): Promise<Pr | null> => {
  const found = (await ghJson($, ['pr', 'view', ...(url ? [url] : []), '--json', 'number,title,url'])) as Pr | null

  return found !== null && typeof found.url === 'string' ? found : null
}

const findChecks = async ($: EngineInterface, url: string): Promise<Check[] | null> => {
  const found = await ghJson($, ['pr', 'checks', url, '--json', 'name,bucket'])

  return Array.isArray(found) ? (found as Check[]) : null
}

const repoName = async ($: EngineInterface): Promise<string> => {
  const root = await $.session.root()

  return root.slice(root.lastIndexOf('/') + 1)
}

const load = async ($: EngineInterface, url?: string): Promise<Pr | null> => {
  const name = await repoName($)
  const found = await findPr($, url)
  const settled = found === null ? null : await findChecks($, found.url)

  await update($, repo, () => name)
  await update($, pr, () => found)
  await update($, checks, () => settled)

  return found
}

const announce = async ($: EngineInterface, shown: Pr, found: Check[]) => {
  const failing = found.filter(isFailed).map(one => one.name)

  if ((await read($, notified)).includes(shown.url) || found.length === 0) {
    return
  }

  await update($, notified, kept => [...kept, shown.url])
  await $.ui
    .notify(failing.length > 0 ? `#${shown.number} checks failed: ${failing.join(', ')}` : `#${shown.number} checks all passed`, { title: 'github-pr-review' })
    .catch(() => undefined)
}

let idle = 0
let grace = 0
let polling: Timer | null = null

// the timer stops itself once no check is pending or the panel has not drawn for IDLE_PERIODS periods
// a read with no array keeps the timer while a check was last seen pending, and for `graced` periods on a new pull request
const poll = ($: EngineInterface, graced = 0) => {
  idle = 0
  grace = graced
  polling ??= $.clock.every(PERIOD_MS, async () => {
    idle += 1
    const shown = await read($, pr)
    const found = shown !== null && idle <= IDLE_PERIODS ? await findChecks($, shown.url) : null

    if (shown !== null && found !== null) {
      grace = 0
      await update($, checks, () => found)

      if (found.some(isPending)) {
        return
      }

      await announce($, shown, found)
    } else if (shown !== null && idle <= IDLE_PERIODS && (grace > 0 || (await read($, checks))?.some(isPending))) {
      grace = Math.max(0, grace - 1)

      return
    }

    polling?.cancel()
    polling = null
  })
}

const watch = async ($: EngineInterface) => {
  if ((await read($, checks))?.some(isPending)) {
    poll($)
  }
}

const show = async ($: EngineInterface) => {
  if (!(await $.ui.open(OPEN)).isPlaced) {
    $.ui.toast('Widen the terminal or run /github-pr-review-panel')
  }
}

const forget = async ($: EngineInterface) => {
  await update($, pr, () => null)
  await update($, checks, () => null)
  await update($, review, () => [])
  await update($, stamps, () => [])
  await update($, fleet, () => [])
  await update($, expanded, () => null)
}

const isReview = (name: string): boolean => name === 'github-pr-review' || name.endsWith(':github-pr-review')

const startReview = async ($: EngineInterface) => {
  const name = await repoName($)

  await update($, repo, () => name)
  await update($, followed, () => null)
  await forget($)
  await show($)
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const span = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

const reviewLines = (text: string): ReviewLine[] =>
  text.split('\n').flatMap(line => {
    try {
      const parsed = JSON.parse(line)

      return parsed && REVIEW_KINDS.has(parsed.kind) ? [parsed as ReviewLine] : []
    } catch {
      return []
    }
  })

const runningStep = (lines: ReviewLine[]): string | null => {
  const last = lines.findLast(line => line.kind === 'step' || line.kind === 'done')

  return last?.kind === 'step' ? last.name : null
}

const cut = (text: string, width: number): string => (text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text)

const fit = (text: string, width: number): string => cut(text, width).padEnd(width)

const wrapped = (text: string, width: number): string[] => {
  const broken: string[] = []
  let rest = text.trim()

  while (rest && broken.length < DETAIL_ROWS) {
    const space = rest.lastIndexOf(' ', width)
    const cut = rest.length <= width ? rest.length : space > 0 ? space : width

    broken.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }

  return rest ? [...broken.slice(0, -1), `${broken[broken.length - 1]!.slice(0, Math.max(0, width - 1))}…`] : broken
}

const findings = (lines: ReviewLine[]) => {
  const judged = new Map(lines.flatMap(line => (line.kind === 'verdict' ? [[line.id, line] as const] : [])))
  const raised = lines.flatMap(line => (line.kind === 'finding' ? [line] : []))
  const shown = raised
    .flatMap(one => {
      const verdict = judged.get(one.id)

      return verdict?.kept === false ? [] : [{ ...one, isKept: verdict?.kept === true, why: verdict?.why ?? '' }]
    })
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.path.localeCompare(b.path))

  return { shown, cut: raised.length - shown.length }
}

const timeline = (lines: ReviewLine[], stamped: number[], now: number) => {
  const at = lines.map((line, index) => ({ line, stamp: stamped[index] ?? now }))
  const finish = lines.findIndex(line => line.kind === 'done')
  const done = lines[finish]
  const rows = STEPS.map((name, order) => {
    const from = lines.findIndex(line => line.kind === 'step' && line.name === name)

    if (from === -1) {
      const isSkipped = lines.some(line => line.kind === 'step' && STEPS.indexOf(line.name) > order)

      return { name, state: isSkipped ? ('skipped' as const) : ('pending' as const), ms: null, raised: 0 }
    }

    const next = at.slice(from + 1).find(({ line }) => line.kind === 'step' || line.kind === 'done')
    const upto = next ? at.indexOf(next) : at.length

    return {
      name,
      state: next ? ('done' as const) : ('running' as const),
      ms: (next?.stamp ?? now) - at[from]!.stamp,
      raised: lines.slice(from + 1, upto).filter(line => line.kind === 'finding').length,
    }
  })

  return {
    rows,
    verdict: done?.kind === 'done' ? done.verdict : null,
    total: (at[finish]?.stamp ?? now) - (at[0]?.stamp ?? now),
  }
}

let quiet = 0
let ticking: Timer | null = null

// the timer stops itself once no running review has drawn for IDLE_TICKS ticks
const wake = ($: EngineInterface) => {
  quiet = 0
  ticking ??= $.clock.every(TICK_MS, () => {
    quiet += 1

    if (quiet > IDLE_TICKS) {
      ticking?.cancel()
      ticking = null

      return
    }

    $.ui.invalidate('ui.render')
  })
}

const refresh = async ($: EngineInterface, name: string) => {
  const home = await $.env.get('HOME')

  if (!home) {
    return
  }

  if ((await read($, followed)) !== name) {
    await update($, followed, () => name)
    await forget($)
  }

  const written = reviewLines(await $.fs.read(`${home}/.claude/reviews/${name}`).catch(() => ''))
  const now = await $.clock.now()
  const kept = (await read($, stamps)).slice(0, written.length)

  await update($, review, () => written)
  await update($, stamps, () => [...kept, ...written.slice(kept.length).map(() => now)])

  const line = written.findLast(one => one.kind === 'pr')

  if (line?.kind === 'pr' && line.url !== (await read($, pr))?.url) {
    const settled = await findChecks($, line.url)

    await update($, pr, () => ({ number: line.number, title: line.title, url: line.url }))
    await update($, checks, () => settled)
    await watch($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'github-pr-review-panel', description: "Show the current branch's pull request and its checks in a panel" })

    return next(e)
  })

  on('command.run', { command: 'github-pr-review-panel' }, async $ => {
    const found = await load($)

    await show($)
    await watch($)

    return { text: found === null ? 'No pull request on this branch.' : `#${found.number} in the panel.` }
  })

  on('skill.prompt', async ($, e, next) => {
    if (isReview(e.skill)) {
      await startReview($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const url = e.tool === 'Bash' && !e.agentId && String(e.command ?? '').includes('gh pr create') ? String(ran.text ?? '').match(PR_URL)?.[0] : undefined

    if (url) {
      await load($, url)
      await show($)
      poll($, GRACE_PERIODS)
    }

    const named = JSON.stringify(e).match(REVIEWS)?.[1]

    if (named) {
      await refresh($, named)
    }

    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)

    const agentId = e.parentAgentId || ran.deny !== undefined ? undefined : ran.agentId

    if (agentId) {
      await (async () => {
        const step = runningStep(await read($, review))

        if (step) {
          await update($, fleet, kept => [...kept, { step, id: agentId, isBack: false }])
        }
      })().catch(() => undefined)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId

    if (agentId) {
      await update($, fleet, kept => kept.map(one => (one.id === agentId ? { ...one, isBack: true } : one)))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    idle = 0
    const { Box, Text, Button } = $.ui.resolve(e)
    const shown = await read($, pr)
    const named = await read($, followed)
    const lines = await read($, review)
    const { rows, verdict, total } = timeline(lines, await read($, stamps), named ? await $.clock.now() : 0)
    const joined = (parts: RenderChildren[], gap: string, props: object = {}) =>
      parts.flatMap((part, at) => (at === 0 ? [part] : [<Text {...props}>{gap}</Text>, part]))
    const { shown: raised, cut: cutCount } = findings(lines)
    const kept = raised.filter(one => one.isKept).length
    const proving = raised.length - kept
    const tally = [
      kept > 0 && <Text>{`${kept} kept`}</Text>,
      proving > 0 && <Text color={FILL}>{`${proving} proving`}</Text>,
      cutCount > 0 && <Text>{`${cutCount} cut`}</Text>,
    ].filter(Boolean)
    const mutants = lines.flatMap(line => (line.kind === 'mutant' ? [line] : []))
    const scored = [
      ['killed', 'killed', 'success'],
      ['wrong-reason', 'wrong reason', 'warning'],
      ['survived', 'survived', 'error'],
    ].flatMap(([result, label, color]) => {
      const scoredAs = mutants.filter(one => one.result === result).length

      return scoredAs > 0 ? [<Text color={color}>{`${label} ${scoredAs}`}</Text>] : []
    })
    const agents = await read($, fleet)
    const opened = await read($, expanded)
    const detailLead = ' '.repeat(TAG_WIDTH + 3)
    const detailRoom = Math.max(1, e.props.bodyColumns - TAG_WIDTH - 3)
    const room = Math.max(0, e.props.bodyColumns - SPINE_WIDTH - MARK_WIDTH - STEP_WIDTH - TIME_WIDTH)
    const found = (await read($, checks)) ?? []

    if (named && rows.some(({ state }) => state === 'running')) {
      wake($)
    }

    const failing = found.filter(isFailed).map(one => one.name)
    const pending = found.filter(isPending).map(one => one.name)
    const passed = found.length - failing.length - pending.length
    const counts = [
      passed > 0 && <Text color="success">{`✓ ${passed}`}</Text>,
      pending.length > 0 && <Text color={FILL}>{`● ${pending.length}`}</Text>,
      failing.length > 0 && <Text color="error">{`✗ ${failing.length}`}</Text>,
    ].filter(Boolean)

    const stepDetail = (name: string, state: keyof typeof MARKS, candidates: number): string => {
      const out = agents.filter(one => one.step === name)
      const back = out.filter(one => one.isBack).length

      return state === 'running' && back < out.length
        ? `${back} of ${out.length} back`
        : name === 'analyse' && state === 'done' && candidates > 0
          ? count(candidates, 'candidate')
          : name === 'prove' && mutants.length > 0
            ? count(mutants.length, 'mutant')
            : ''
    }

    if (e.surface === 'desktop') {
      const { Box, Text, Button, Svg } = $.ui.resolve(e)
      const chip = (label: string, color: string, backgroundColor: string) => (
        <Text color={color} backgroundColor={backgroundColor}>{` ${label} `}</Text>
      )
      const chips = [
        passed > 0 && chip(`✓ ${passed} passed`, 'success', 'diffAddedDimmed'),
        pending.length > 0 && chip(`● ${pending.length} pending`, FILL, 'inactive'),
        failing.length > 0 && chip(`✗ ${failing.length} failed`, 'error', 'diffRemovedDimmed'),
        ...failing.map(name => <Text color="error">{name}</Text>),
        ...pending.map(name => <Text color={FILL}>{name}</Text>),
      ].filter(Boolean)
      const steps = rows.map(({ name, state, ms, raised: candidates }) => ({
        name: LABELS[name] ?? name,
        state,
        detail: stepDetail(name, state, candidates),
        time: ms === null ? '' : span(ms),
      }))
      const section = (label: string) => (
        <Text dimColor weight="semibold">
          {label}
        </Text>
      )
      const sized = [
        ['killed', 'killed', 'success', 'diffAdded'],
        ['wrong-reason', 'wrong reason', 'warning', 'warning'],
        ['survived', 'survived', 'error', 'diffRemoved'],
      ].flatMap(([result, label, color, fill]) => {
        const scoredAs = mutants.filter(one => one.result === result).length

        return scoredAs > 0 ? [{ label, color, fill, scoredAs }] : []
      })

      return (
        <Box flexDirection="column" gap={2} padding={2}>
          {shown === null && !named ? (
            <Text dimColor>no pull request on this branch</Text>
          ) : (
            <Box flexDirection="column" gap={2}>
              <Box flexDirection="column">
                <Text dimColor>{`${named ? 'review' : 'pr'} · ${await read($, repo)}`}</Text>
                {shown !== null && (
                  <Box gap={1}>
                    <Text weight="semibold" color={FILL}>{`#${shown.number}`}</Text>
                    <Text weight="semibold">{shown.title}</Text>
                  </Box>
                )}
              </Box>
              {shown !== null && found.length > 0 && (
                <Box flexDirection="column">
                  {section('CHECKS')}
                  <Box flexWrap="wrap" gap={1}>
                    {chips}
                    {failing.length + pending.length === 0 && <Text>all passed</Text>}
                  </Box>
                </Box>
              )}
              {named && verdict !== null && (
                <Box alignItems="center" justifyContent="space-between">
                  <Box gap={1}>
                    {section('REVIEW')}
                    <Text color="success">✓</Text>
                    <Text weight="semibold" color={VERDICTS[verdict]}>
                      {verdict}
                    </Text>
                  </Box>
                  <Text dimColor>{span(total)}</Text>
                </Box>
              )}
              {named && verdict === null && (
                <Box flexDirection="column">
                  <Box justifyContent="space-between">
                    {section('REVIEW')}
                    <Text dimColor>{span(total)}</Text>
                  </Box>
                  <Svg
                    source={timelineSvg(steps)}
                    alt={steps.map(({ name, state, detail, time }) => `${MARKS[state][0]}${name} ${detail} ${time}`.replace(/ +/g, ' ').trim()).join(', ')}
                  />
                </Box>
              )}
              {named && raised.length + cutCount > 0 && (
                <Box flexDirection="column" gap={1}>
                  <Box justifyContent="space-between">
                    {section('FINDINGS')}
                    <Box gap={1}>{tally}</Box>
                  </Box>
                  {raised.map((one, at) => {
                    const hotkey = at < 9 ? String(at + 1) : null
                    const dim = one.isKept ? {} : { dimColor: true }
                    const tone = one.isKept ? (TIER_COLORS[one.tier] ?? 'inactive') : FILL

                    return (
                      <Box flexDirection="column" gap={1}>
                        <Box gap={2} alignItems="center">
                          <Text weight="semibold" color={tone}>{one.isKept ? one.tier : 'proving'}</Text>
                          <Box flexGrow={1}>
                            <Button
                              plain
                              key={`finding-${one.id}`}
                              {...(hotkey ? { hotkey } : {})}
                              onPress={() => void update($, expanded, current => (current === one.id ? null : one.id))}
                            >
                              <Text {...dim}>{one.claim}</Text>
                            </Button>
                          </Box>
                          {hotkey && <Text dimColor>{hotkey}</Text>}
                        </Box>
                        {opened === one.id && (
                          <Box flexDirection="column" gap={1} paddingLeft={2}>
                            <Text dimColor>{`${one.path}:${one.line}`}</Text>
                            <Text {...dim}>{one.claim}</Text>
                            {one.isKept && one.why && (
                              <Box gap={1} padding={1} backgroundColor="diffAddedDimmed">
                                <Text color="success">✓</Text>
                                <Text>{one.why}</Text>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              )}
              {named && mutants.length > 0 && (
                <Box flexDirection="column" gap={1}>
                  <Box justifyContent="space-between">
                    {section('MUTANTS')}
                    <Box gap={2}>
                      {sized.map(({ label, color, scoredAs }) => (
                        <Text color={color}>{`${scoredAs} ${label}`}</Text>
                      ))}
                    </Box>
                  </Box>
                  <Box>
                    {sized.map(({ fill, scoredAs }) => (
                      <Box flexGrow={scoredAs} height={1} backgroundColor={fill} />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.scroll.bodyRows}>
        <Box justifyContent="space-between">
          <Text dimColor>{`${named ? 'review' : 'pr'} · ${await read($, repo)}`}</Text>
          <Text dimColor>/github-pr-review-panel</Text>
        </Box>
        <Text> </Text>
        {shown === null && !named ? (
          <Text dimColor>no pull request on this branch</Text>
        ) : (
          <Box flexDirection="column">
            {shown !== null && (
              <Box>
                <Text color={FILL}>{`#${shown.number}`}</Text>
                <Text weight="semibold" wrap="truncate-end">{` ${shown.title}`}</Text>
              </Box>
            )}
            {shown !== null && found.length > 0 && (
              <Box>
                <Text dimColor>{'CHECKS'.padEnd(LABEL_WIDTH)}</Text>
                {joined(counts, '  ')}
                {failing.length + pending.length === 0 && <Text>{'  all passed'}</Text>}
                {failing.length + pending.length > 0 && <Text>{'   '}</Text>}
                {failing.length > 0 && (
                  <Text color="error" wrap="truncate-end">
                    {failing.join(', ')}
                  </Text>
                )}
                {failing.length > 0 && pending.length > 0 && <Text>{', '}</Text>}
                {pending.length > 0 && <Text wrap="truncate-end">{pending.join(', ')}</Text>}
              </Box>
            )}
            {named && shown !== null && <Text> </Text>}
            {named && verdict !== null && (
              <Box justifyContent="space-between">
                <Box>
                  <Text dimColor>{'REVIEW'.padEnd(LABEL_WIDTH)}</Text>
                  <Text color="success">{'✓ '}</Text>
                  <Text weight="semibold" color={VERDICTS[verdict]}>
                    {verdict}
                  </Text>
                </Box>
                <Text>{span(total)}</Text>
              </Box>
            )}
            {named && verdict === null && (
              <Box flexDirection="column">
                <Box justifyContent="space-between">
                  <Text dimColor>REVIEW</Text>
                  <Text>{span(total)}</Text>
                </Box>
                {rows.map(({ name, state, ms, raised: candidates }, at) => {
                  const detail = stepDetail(name, state, candidates)

                  return (
                    <Box>
                      <Text dimColor>{at === rows.length - 1 ? '└─ ' : '├─ '}</Text>
                      <Text {...MARKS[state][1]}>{MARKS[state][0]}</Text>
                      <Text {...NAMES[state]}>{(LABELS[name] ?? name).padEnd(STEP_WIDTH)}</Text>
                      <Text>{detail.padEnd(room)}</Text>
                      <Text {...(state === 'running' ? { color: FILL, weight: 'semibold' } : {})}>
                        {(ms === null ? '' : span(ms)).padStart(TIME_WIDTH)}
                      </Text>
                    </Box>
                  )
                })}
              </Box>
            )}
            {named && raised.length + cutCount > 0 && (
              <Box flexDirection="column">
                <Text> </Text>
                <Box>
                  <Text dimColor>{'FINDINGS'.padEnd(LABEL_WIDTH)}</Text>
                  {joined(tally, ' · ', { dimColor: true })}
                </Box>
                {raised.flatMap((one, at) => {
                  const hotkey = at < 9 ? String(at + 1) : null
                  const place = `${one.path.slice(one.path.lastIndexOf('/') + 1)}:${one.line}`
                  const label = `${fit(place, LOC_WIDTH)}  ${one.claim}`
                  const labelRoom = e.props.bodyColumns - 1 - TAG_WIDTH - 2 - (hotkey ? HOTKEY_WIDTH : 0)
                  const dim = one.isKept ? {} : { dimColor: true }

                  return [
                    <Box>
                      <Text>{' '}</Text>
                      <Text weight="semibold" {...(one.isKept ? (TIER_COLORS[one.tier] ? { color: TIER_COLORS[one.tier] } : {}) : { color: FILL })}>
                        {(one.isKept ? one.tier : 'proving').padEnd(TAG_WIDTH)}
                      </Text>
                      <Text>{'  '}</Text>
                      <Button
                        plain
                        key={`finding-${one.id}`}
                        {...(hotkey ? { hotkey } : {})}
                        onPress={() => void update($, expanded, current => (current === one.id ? null : one.id))}
                      >
                        <Text wrap="truncate-end" {...dim}>
                          {cut(label, labelRoom)}
                        </Text>
                      </Button>
                    </Box>,
                    ...(opened === one.id
                      ? [
                          <Box>
                            <Text>{detailLead}</Text>
                            <Text wrap="truncate-start" {...dim}>
                              {`${one.path}:${one.line}`}
                            </Text>
                          </Box>,
                          ...wrapped(one.claim, detailRoom).map(text => (
                            <Box>
                              <Text>{detailLead}</Text>
                              <Text {...dim}>{text}</Text>
                            </Box>
                          )),
                          ...(one.isKept && one.why
                            ? wrapped(one.why, detailRoom - 2).map((text, row) => (
                                <Box>
                                  <Text>{detailLead}</Text>
                                  <Text color="success">{row === 0 ? '✓ ' : '  '}</Text>
                                  <Text>{text}</Text>
                                </Box>
                              ))
                            : []),
                        ]
                      : []),
                  ]
                })}
              </Box>
            )}
            {named && mutants.length > 0 && (
              <Box flexDirection="column">
                <Text> </Text>
                <Box>
                  <Text dimColor>{'MUTANTS'.padEnd(LABEL_WIDTH)}</Text>
                  {joined(scored, ' · ', { dimColor: true })}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
