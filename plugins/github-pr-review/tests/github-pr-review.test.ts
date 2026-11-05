import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/src/widgets', surface: 'terminal', isInteractive: true } as const
const PANE = {
  plugin: 'github-pr-review',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'github-pr-review',
  viewport: { columns: 60, rows: 24 },
  props: {
    title: 'Pull request',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const VIEW = { number: 214, title: 'Retry with backoff on 429', url: 'https://github.com/o/r/pull/214' }
const LINE = (text: string, props: object = {}) => ({ text, props })
const DIM = (text: string) => LINE(text, { dimColor: true })
const TOP = [DIM('pr · widgets'), DIM('/github-pr-review-panel'), LINE(' ')]
const PR = [LINE('#214', { color: 'permission' }), LINE(' Retry with backoff on 429', { weight: 'semibold', wrap: 'truncate-end' })]

type Answer = { exitCode: number; stdout: string }
type Host = { view?: Answer; checks?: Answer | (() => Answer) | 'throws'; placed?: boolean; review?: (path: string) => string }
const NO_PR = { exitCode: 1, stdout: '' }

// The repository's root, and the answers `gh` gives, and a record of the argv it was run with.
const world = (on: On, { view = { exitCode: 0, stdout: JSON.stringify(VIEW) }, checks = NO_PR, placed = true, review }: Host = {}) => {
  const ran: string[][] = []
  mock.env(on, { HOME: '/home/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/src/widgets' }))
  on('command.register', () => ({ value: { command: 'github-pr-review-panel' } }))
  on('ui.open', () => ({ value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }))
  on('fs.read', (_, e) =>
    review !== undefined && e.path.startsWith('/home/me/.claude/reviews/') ? { value: review(e.path) } : { deny: `unexpected read of ${e.path}` },
  )
  on('process.run', (_, e) => {
    ran.push([...e.argv])

    if (checks === 'throws' && e.argv.includes('checks')) {
      throw new Error('gh is unavailable')
    }

    const result = e.argv.includes('checks') ? (typeof checks === 'function' ? checks() : (checks as Answer)) : view

    return { value: { ...result, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return ran
}

const SPAWN = { tool_use_id: 'toolu_1', description: 'verify', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false } as const
const COMMAND = { command: 'github-pr-review-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 60 } } as const

const rowsOf = async ($: Engine) => {
  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  await ui.unmount()

  return rows
}

const drawn = async ($: Engine, on: On, host: Host = {}) => {
  const ran = world(on, host)
  await $.session.start(START)
  await $.command.run(COMMAND)

  return { ran, rows: await rowsOf($) }
}

const output = (checks: object[], exitCode = 0) => ({ exitCode, stdout: JSON.stringify(checks) })

test('draws the count in each bucket and the names of the failing and pending checks', async ($, on) => {
  const checks = [
    { name: 'build', bucket: 'pass' },
    { name: 'unit', bucket: 'pass' },
    { name: 'lint', bucket: 'pending' },
    { name: 'e2e', bucket: 'fail' },
    { name: 'deploy', bucket: 'cancel' },
  ]

  const { ran, rows } = await drawn($, on, { checks: output(checks, 1) })

  expect(rows).toEqual([
    ...TOP,
    ...PR,
    DIM('CHECKS    '),
    LINE('✓ 2', { color: 'success' }),
    LINE('  '),
    LINE('● 1', { color: 'permission' }),
    LINE('  '),
    LINE('✗ 2', { color: 'error' }),
    LINE('   '),
    LINE('e2e, deploy', { color: 'error', wrap: 'truncate-end' }),
    LINE(', '),
    LINE('lint', { wrap: 'truncate-end' }),
  ])
  expect(ran).toEqual([
    ['gh', 'pr', 'view', '--json', 'number,title,url'],
    ['gh', 'pr', 'checks', VIEW.url, '--json', 'name,bucket'],
  ])
})

test('says all passed when no check fails or is pending', async ($, on) => {
  const { rows } = await drawn($, on, { checks: output([{ name: 'build', bucket: 'pass' }]) })

  expect(rows).toEqual([...TOP, ...PR, DIM('CHECKS    '), LINE('✓ 1', { color: 'success' }), LINE('  all passed')])
})

test('leaves the checks row out when gh throws', async ($, on) => {
  const { rows } = await drawn($, on, { checks: 'throws' })

  expect(rows).toEqual([...TOP, ...PR])
})

test('leaves the checks row out when gh prints text that is not JSON', async ($, on) => {
  const { rows } = await drawn($, on, { checks: { exitCode: 1, stdout: 'no checks reported' } })

  expect(rows).toEqual([...TOP, ...PR])
})

test('leaves the checks row out when gh prints JSON that is not an array', async ($, on) => {
  const { rows } = await drawn($, on, { checks: { exitCode: 0, stdout: '{}' } })

  expect(rows).toEqual([...TOP, ...PR])
})

test('draws the tagline and a line saying so when the branch has no pull request', async ($, on) => {
  const { rows } = await drawn($, on, { view: NO_PR })

  expect(rows).toEqual([...TOP, DIM('no pull request on this branch')])
})

const CREATED = { tool: 'Bash', command: 'gh pr create --fill' } as const
const PENDING = [
  { name: 'build', bucket: 'pass' },
  { name: 'lint', bucket: 'pending' },
]

const created = async ($: Engine, on: On, checks: () => Answer, placed = true) => {
  const clock = mock.clock(on)
  const ran = world(on, { checks, placed })
  const seen = { toasts: [] as string[], notes: [] as unknown[] }
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.notify', (_, e) => {
    seen.notes.push({ text: e.text, title: e.title })

    return { value: { isSent: true, channel: 'kitty' } }
  })
  on('tool.call', (_, e) => ({ result: '', text: 'command' in e && e.command === CREATED.command ? `${VIEW.url}\n` : '' }))

  await $.session.start(START)
  await $.tool.call(CREATED)

  return { clock, ran, seen }
}

const checksRuns = (ran: string[][]) => ran.filter(argv => argv.includes('checks')).length

test('opens the panel on a new pull request, polls its pending checks and notifies once when they pass', async ($, on) => {
  let answer = output(PENDING, 8)
  const { clock, ran, seen } = await created($, on, () => answer)

  await clock.advance(30_000)
  answer = output([{ name: 'build', bucket: 'pass' }, { name: 'lint', bucket: 'pass' }])
  await clock.advance(30_000)
  await clock.advance(90_000)

  expect({ seen, runs: checksRuns(ran), rows: await rowsOf($) }).toEqual({
    seen: { toasts: [], notes: [{ text: '#214 checks all passed', title: 'github-pr-review' }] },
    runs: 3,
    rows: [...TOP, ...PR, DIM('CHECKS    '), LINE('✓ 2', { color: 'success' }), LINE('  all passed')],
  })
})

test('names the failed checks in the one notification', async ($, on) => {
  let answer = output(PENDING, 8)
  const { clock, seen } = await created($, on, () => answer)

  answer = output([{ name: 'build', bucket: 'fail' }, { name: 'lint', bucket: 'pass' }], 1)
  await clock.advance(30_000)

  expect(seen.notes).toEqual([{ text: '#214 checks failed: build', title: 'github-pr-review' }])
})

test('toasts a fallback when the panel is not placed', async ($, on) => {
  const { seen } = await created($, on, () => output(PENDING, 8), false)

  expect(seen.toasts).toEqual(['Widen the terminal or run /github-pr-review-panel'])
})

test('notifies once on the first period when the checks are already settled, and stops polling', async ($, on) => {
  const { clock, ran, seen } = await created($, on, () => output([{ name: 'build', bucket: 'pass' }]))

  await clock.advance(120_000)

  expect({ runs: checksRuns(ran), notes: seen.notes }).toEqual({ runs: 2, notes: [{ text: '#214 checks all passed', title: 'github-pr-review' }] })
})

test('keeps polling a new pull request whose checks are not reported at first, then notifies once when they pass', async ($, on) => {
  let answer: Answer = { exitCode: 1, stdout: 'no checks reported' }
  const { clock, ran, seen } = await created($, on, () => answer)

  await clock.advance(60_000)
  answer = output(PENDING, 8)
  await clock.advance(30_000)
  answer = output([{ name: 'build', bucket: 'pass' }, { name: 'lint', bucket: 'pass' }])
  await clock.advance(30_000)
  await clock.advance(120_000)

  expect({ seen, runs: checksRuns(ran), rows: await rowsOf($) }).toEqual({
    seen: { toasts: [], notes: [{ text: '#214 checks all passed', title: 'github-pr-review' }] },
    runs: 5,
    rows: [...TOP, ...PR, DIM('CHECKS    '), LINE('✓ 2', { color: 'success' }), LINE('  all passed')],
  })
})

test('stops polling a pull request whose checks are never reported after four periods, with no notification', async ($, on) => {
  const { clock, ran, seen } = await created($, on, () => ({ exitCode: 1, stdout: 'no checks reported' }))

  // the panel draws each period, so the idle rule never stops the timer and the grace is what does
  for (let period = 0; period < 8; period += 1) {
    await clock.advance(30_000)
    await rowsOf($)
  }

  expect({ runs: checksRuns(ran), notes: seen.notes }).toEqual({ runs: 6, notes: [] })
})

test('keeps polling through a failed read while a check was last seen pending', async ($, on) => {
  let answer: Answer = output(PENDING, 8)
  const { clock, ran, seen } = await created($, on, () => answer)

  await clock.advance(30_000)
  answer = { exitCode: 1, stdout: '' }
  await clock.advance(30_000)
  answer = output([{ name: 'build', bucket: 'pass' }, { name: 'lint', bucket: 'pass' }])
  await clock.advance(30_000)

  expect({ runs: checksRuns(ran), notes: seen.notes }).toEqual({ runs: 4, notes: [{ text: '#214 checks all passed', title: 'github-pr-review' }] })
})

test('polls the checks of a pull request loaded by the command while one is pending', async ($, on) => {
  const clock = mock.clock(on)
  let answer = output(PENDING, 8)
  const ran = world(on, { checks: () => answer })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'kitty' } }))
  await $.session.start(START)
  await $.command.run(COMMAND)

  answer = output([{ name: 'build', bucket: 'pass' }, { name: 'lint', bucket: 'pass' }])
  await clock.advance(30_000)

  expect({ runs: checksRuns(ran), rows: await rowsOf($) }).toEqual({
    runs: 2,
    rows: [...TOP, ...PR, DIM('CHECKS    '), LINE('✓ 2', { color: 'success' }), LINE('  all passed')],
  })
})

test('stops polling once the panel has not drawn for five periods', async ($, on) => {
  const { clock, ran } = await created($, on, () => output(PENDING, 8))

  await clock.advance(600_000)

  expect(checksRuns(ran)).toEqual(6)
})

const REVIEW_TOP = [DIM('review · widgets'), DIM('/github-pr-review-panel'), LINE(' ')]
const CHECKED = [DIM('CHECKS    '), LINE('✓ 1', { color: 'success' }), LINE('  all passed')]
const SIDECAR = '~/.claude/reviews/o-r-214.jsonl'
const JSONL = (...lines: object[]) => lines.map(line => `${JSON.stringify(line)}\n`).join('')
const PR_LINE = { kind: 'pr', number: 214, title: VIEW.title, url: VIEW.url, head: '9f2c1ab' }
const STEP = (name: string) => ({ kind: 'step', name })

const MARK = { done: ['✓ ', { color: 'success' }], running: ['● ', { color: 'permission' }], pending: ['○ ', { dimColor: true }], skipped: ['– ', { dimColor: true }] } as const
const NAME = { done: {}, running: { weight: 'semibold' }, pending: { dimColor: true }, skipped: { dimColor: true } } as const
const ROW = (last: boolean, state: keyof typeof MARK, name: string, detail: string, time: string) => [
  DIM(last ? '└─ ' : '├─ '),
  LINE(MARK[state][0], MARK[state][1]),
  LINE(name.padEnd(13), NAME[state]),
  LINE(detail.padEnd(36)),
  LINE(time.padStart(6), state === 'running' ? { color: 'permission', weight: 'semibold' } : {}),
]

type Reviewing = { isLoaded?: boolean; placed?: boolean }

const held = (on: On) => {
  const atoms = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: atoms.get(e.key), version: 0 } }))
  on('state.set', (_, e) => {
    atoms.set(e.key, e.value)

    return { value: { isSet: true, version: 0 } }
  })

  return atoms
}

const reviewing = async ($: Engine, on: On, text: (path: string) => string, { isLoaded = false, placed = true }: Reviewing = {}) => {
  const clock = mock.clock(on)
  world(on, { checks: output([{ name: 'build', bucket: 'pass' }]), review: text, placed })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  let spawned = 0
  on('tool.call', () => ({ result: '', text: '' }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: `agent-${(spawned += 1)}` }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start(START)

  if (isLoaded) {
    await $.command.run(COMMAND)
  }

  await $.skill.prompt({ skill: 'github-pr-review:github-pr-review', text: '' })

  return clock
}

test('draws a review as a spine from its sidecar, with a skipped step and the agents back', async ($, on) => {
  let text = JSONL(STEP('fetch'))
  const clock = await reviewing($, on, () => text)

  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  await clock.advance(12_000)
  text += JSONL(PR_LINE, STEP('analyse'))
  await $.tool.call({ tool: 'Bash', command: `jq >> ${SIDECAR}` })
  await clock.advance(100_000)
  text += JSONL(STEP('verify'))
  await $.tool.call({ tool: 'Bash', command: `jq >> ${SIDECAR}` })
  await $.agent.spawn({ ...SPAWN, prompt: 'one' })
  await $.agent.spawn({ ...SPAWN, prompt: 'two' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await clock.advance(41_000)

  expect(await rowsOf($)).toEqual([
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW'),
    LINE('2m33s'),
    ...ROW(false, 'done', 'fetch', '', '12s'),
    ...ROW(false, 'done', 'analyse', '', '1m40s'),
    ...ROW(false, 'skipped', 'prove tests', '', ''),
    ...ROW(false, 'running', 'verify', '1 of 2 back', '41s'),
    ...ROW(false, 'pending', 'cull', '', ''),
    ...ROW(true, 'pending', 'report', '', ''),
  ])
})

test('folds a finished review into one row with its verdict and total time', async ($, on) => {
  let text = JSONL(STEP('fetch'), PR_LINE)
  const clock = await reviewing($, on, () => text)

  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  await clock.advance(75_000)
  text += JSONL(STEP('report'), { kind: 'done', verdict: 'CHANGES REQUESTED' })
  await $.tool.call({ tool: 'Bash', command: `jq >> ${SIDECAR}` })
  await clock.advance(30_000)

  expect(await rowsOf($)).toEqual([
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW    '),
    LINE('✓ ', { color: 'success' }),
    LINE('CHANGES REQUESTED', { weight: 'semibold', color: 'error' }),
    LINE('1m15s'),
  ])
})

const FETCHING = [
  ...REVIEW_TOP,
  DIM('REVIEW'),
  LINE('0s'),
  ...ROW(false, 'running', 'fetch', '', '0s'),
  ...['analyse', 'prove tests', 'verify', 'cull'].flatMap(name => ROW(false, 'pending', name, '', '')),
  ...ROW(true, 'pending', 'report', '', ''),
]

test('draws the spine and no pull request line while a review has not read its pr line', async ($, on) => {
  await reviewing($, on, () => JSONL(STEP('fetch')))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  expect(await rowsOf($)).toEqual(FETCHING)
})

test('drops a pull request loaded before the review starts', async ($, on) => {
  await reviewing($, on, () => JSONL(STEP('fetch')), { isLoaded: true })
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  expect(await rowsOf($)).toEqual(FETCHING)
})

test('clears the drawn review and its pull request when a call names another sidecar', async ($, on) => {
  await reviewing($, on, path => (path.endsWith('o-r-214.jsonl') ? JSONL(PR_LINE, STEP('verify')) : JSONL(STEP('fetch'))))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  await $.tool.call({ tool: 'Bash', command: ': > ~/.claude/reviews/o-r-215.jsonl' })

  expect(await rowsOf($)).toEqual(FETCHING)
})

test('recognises a sidecar named by the skill script call', async ($, on) => {
  await reviewing($, on, path => (path.endsWith('o-r-214.jsonl') ? JSONL(PR_LINE, STEP('verify')) : JSONL(STEP('fetch'))))
  await $.tool.call({ tool: 'Bash', command: `bash /home/me/.claude/skills/github-pr-review/scripts/sidecar.bash ${SIDECAR} init` })
  await $.tool.call({ tool: 'Bash', command: "bash /home/me/.claude/skills/github-pr-review/scripts/sidecar.bash ~/.claude/reviews/o-r-215.jsonl step fetch" })

  expect(await rowsOf($)).toEqual(FETCHING)
})

test('toasts a fallback when a review starts and the panel is not placed', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await reviewing($, on, () => '', { placed: false })

  expect(toasts).toEqual(['Widen the terminal or run /github-pr-review-panel'])
})

test('opens the panel when github-pr-review expands, bare or namespaced, and not for another skill or a prompt naming it', async ($, on) => {
  const toasts: string[] = []
  world(on, { placed: false })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  await $.prompt.submit({ text: 'should I run /github-pr-review here?', wait: false, origin: { kind: 'composer' } })
  await $.skill.prompt({ skill: 'commit', text: '' })
  await $.skill.prompt({ skill: 'github-pr-review-helper', text: '' })
  await $.skill.prompt({ skill: 'other:github-pr-review-lite', text: '' })
  const before = [...toasts]
  await $.skill.prompt({ skill: 'github-pr-review', text: '' })
  await $.skill.prompt({ skill: 'github-pr-review:github-pr-review', text: '' })

  expect({ before, toasts }).toEqual({ before: [], toasts: ['Widen the terminal or run /github-pr-review-panel', 'Widen the terminal or run /github-pr-review-panel'] })
})

test('matches each agent spawned during a step to its own turn by id', async ($, on) => {
  const verifying = (detail: string) => [
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW'),
    LINE('0s'),
    ...['fetch', 'analyse', 'prove tests'].flatMap(name => ROW(false, 'skipped', name, '', '')),
    ...ROW(false, 'running', 'verify', detail, '0s'),
    ...ROW(false, 'pending', 'cull', '', ''),
    ...ROW(true, 'pending', 'report', '', ''),
  ]
  const atoms = held(on)
  await reviewing($, on, () => JSONL(PR_LINE, STEP('verify')))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  await $.agent.spawn({ ...SPAWN, prompt: 'one' })
  await $.agent.spawn({ ...SPAWN, prompt: 'two' })
  const out = await rowsOf($)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'agent-2', reason: 'answer' })
  const second = await rowsOf($)
  const fleet = atoms.get('fleet')
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })

  expect({ out, second, fleet, both: await rowsOf($) }).toEqual({
    out: verifying('0 of 2 back'),
    second: verifying('1 of 2 back'),
    fleet: [
      { step: 'verify', id: 'agent-1', isBack: false },
      { step: 'verify', id: 'agent-2', isBack: true },
    ],
    both: verifying(''),
  })
})

const FINDING = (id: number, tier: string, path: string, line: number, claim: string) => ({ kind: 'finding', id, tier, path, line, claim })
const VERDICT = (id: number, kept: boolean) => ({ kind: 'verdict', id, kept, why: 'because' })
const TAG = (text: string, props: object) => LINE(text.padEnd(10), { weight: 'semibold', ...props })
const ENTRY = (tag: object, place: string, claim: string, dim = false) => [
  LINE(' '),
  tag,
  LINE('  '),
  LINE(`${place.padEnd(16)}  ${claim}`, { wrap: 'truncate-end', ...(dim ? { dimColor: true } : {}) }),
]

test('draws findings by tier then path, dim and proving until judged, with the cut ones counted', async ($, on) => {
  const text = JSONL(
    PR_LINE,
    STEP('fetch'),
    STEP('analyse'),
    FINDING(1, 'NIT', 'src/b.ts', 12, 'rename tmp'),
    FINDING(2, 'BLOCKING', 'src/auth/token.ts', 42, 'raw query takes a request param'),
    FINDING(3, 'IMPORTANT', 'src/net/retry.ts', 88, 'no test for the exhausted case'),
    FINDING(4, 'SUGGESTION', 'src/a.ts', 3, 'extract the parsing'),
    STEP('verify'),
    VERDICT(1, true),
    VERDICT(2, true),
    VERDICT(4, false),
  )
  await reviewing($, on, () => text)
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  expect(await rowsOf($)).toEqual([
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW'),
    LINE('0s'),
    ...ROW(false, 'done', 'fetch', '', '0s'),
    ...ROW(false, 'done', 'analyse', '4 candidates', '0s'),
    ...ROW(false, 'skipped', 'prove tests', '', ''),
    ...ROW(false, 'running', 'verify', '', '0s'),
    ...ROW(false, 'pending', 'cull', '', ''),
    ...ROW(true, 'pending', 'report', '', ''),
    LINE(' '),
    DIM('FINDINGS  '),
    LINE('2 kept'),
    DIM(' · '),
    LINE('1 proving', { color: 'permission' }),
    DIM(' · '),
    LINE('1 cut'),
    ...ENTRY(TAG('BLOCKING', { color: 'error' }), 'token.ts:42', 'raw query takes a request…'),
    ...ENTRY(TAG('proving', { color: 'permission' }), 'retry.ts:88', 'no test for the exhausted…', true),
    ...ENTRY(TAG('NIT', {}), 'b.ts:12', 'rename tmp'),
  ])
})

const CLAIM = 'raw query takes a request param that is never escaped before it reaches the database layer'
const DETAIL = (...rows: object[][]) => rows.flatMap(row => [LINE(' '.repeat(13)), ...row])
const WHY = (first: string, ...rest: string[]) => [[LINE('✓ ', { color: 'success' }), LINE(first)], ...rest.map(text => [LINE('  ', { color: 'success' }), LINE(text)])]

test('opens a finding to its path, claim and verdict on a press of its Button, one at a time, and closes it on the next', async ($, on) => {
  const text = JSONL(
    PR_LINE,
    STEP('verify'),
    FINDING(1, 'BLOCKING', 'src/auth/token.ts', 42, CLAIM),
    FINDING(2, 'NIT', 'src/b.ts', 12, 'rename tmp'),
    FINDING(3, 'QUESTION', 'src/c.ts', 5, 'is this needed'),
    { kind: 'verdict', id: 1, kept: true, why: 'db.raw() interpolates req.query.token with no escape on the way in' },
    VERDICT(2, true),
  )
  await reviewing($, on, () => text)
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  const ui = await $.ui.mount(PANE)
  const entries = async () => {
    const all = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))

    return all.slice(all.findIndex(row => row.text === 'BLOCKING  ') - 1)
  }
  const buttons = (await ui.findAll({ type: 'Button' })).map(({ props }) => ({ key: props.key, hotkey: props.hotkey }))
  const first = ENTRY(TAG('BLOCKING', { color: 'error' }), 'token.ts:42', 'raw query takes a request…')
  const second = ENTRY(TAG('NIT', {}), 'b.ts:12', 'rename tmp')
  const third = ENTRY(TAG('proving', { color: 'permission' }), 'c.ts:5', 'is this needed', true)

  const before = await entries()
  await ui.press({ key: 'finding-1' })
  const opened = await entries()
  await ui.press({ key: 'finding-2' })
  const switched = await entries()
  await ui.press({ key: 'finding-2' })
  const after = await entries()

  expect({ buttons, before, opened, switched, after }).toEqual({
    buttons: [
      { key: 'finding-1', hotkey: '1' },
      { key: 'finding-2', hotkey: '2' },
      { key: 'finding-3', hotkey: '3' },
    ],
    before: [...first, ...second, ...third],
    opened: [
      ...first,
      ...DETAIL(
        [LINE('src/auth/token.ts:42', { wrap: 'truncate-start' })],
        [LINE('raw query takes a request param that is never')],
        [LINE('escaped before it reaches the database layer')],
        ...WHY('db.raw() interpolates req.query.token with no', 'escape on the way in'),
      ),
      ...second,
      ...third,
    ],
    switched: [
      ...first,
      ...second,
      ...DETAIL([LINE('src/b.ts:12', { wrap: 'truncate-start' })], [LINE('rename tmp')], ...WHY('because')),
      ...third,
    ],
    after: [...first, ...second, ...third],
  })
})

test('gives the first nine findings a digit and the tenth none', async ($, on) => {
  const raised = Array.from({ length: 10 }, (_, at) => FINDING(at + 1, 'NIT', `src/${String.fromCharCode(97 + at)}.ts`, 1, 'rename tmp'))
  await reviewing($, on, () => JSONL(PR_LINE, STEP('analyse'), ...raised))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  const ui = await $.ui.mount(PANE)

  expect((await ui.findAll({ type: 'Button' })).map(({ props }) => ({ key: props.key, hotkey: props.hotkey }))).toEqual([
    ...Array.from({ length: 9 }, (_, at) => ({ key: `finding-${at + 1}`, hotkey: String(at + 1) })),
    { key: 'finding-10', hotkey: undefined },
  ])
})

const MUTANT = (result: string) => ({ kind: 'mutant', test: 'retries on 429', result })

test('counts mutants by result under the findings and on the prove tests row', async ($, on) => {
  const text = JSONL(
    PR_LINE,
    STEP('fetch'),
    STEP('prove'),
    MUTANT('killed'),
    MUTANT('killed'),
    MUTANT('wrong-reason'),
    MUTANT('survived'),
    STEP('verify'),
    FINDING(1, 'NIT', 'src/b.ts', 12, 'rename tmp'),
    VERDICT(1, true),
  )
  await reviewing($, on, () => text)
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  expect(await rowsOf($)).toEqual([
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW'),
    LINE('0s'),
    ...ROW(false, 'done', 'fetch', '', '0s'),
    ...ROW(false, 'skipped', 'analyse', '', ''),
    ...ROW(false, 'done', 'prove tests', '4 mutants', '0s'),
    ...ROW(false, 'running', 'verify', '', '0s'),
    ...ROW(false, 'pending', 'cull', '', ''),
    ...ROW(true, 'pending', 'report', '', ''),
    LINE(' '),
    DIM('FINDINGS  '),
    LINE('1 kept'),
    ...ENTRY(TAG('NIT', {}), 'b.ts:12', 'rename tmp'),
    LINE(' '),
    DIM('MUTANTS   '),
    LINE('killed 2', { color: 'success' }),
    DIM(' · '),
    LINE('wrong reason 1', { color: 'warning' }),
    DIM(' · '),
    LINE('survived 1', { color: 'error' }),
  ])
})

test('draws the mutants row with no findings, a singular count and a zero left off', async ($, on) => {
  await reviewing($, on, () => JSONL(PR_LINE, STEP('prove'), MUTANT('survived')))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })

  expect(await rowsOf($)).toEqual([
    ...REVIEW_TOP,
    ...PR,
    ...CHECKED,
    LINE(' '),
    DIM('REVIEW'),
    LINE('0s'),
    ...ROW(false, 'skipped', 'fetch', '', ''),
    ...ROW(false, 'skipped', 'analyse', '', ''),
    ...ROW(false, 'running', 'prove tests', '1 mutant', '0s'),
    ...['verify', 'cull'].flatMap(name => ROW(false, 'pending', name, '', '')),
    ...ROW(true, 'pending', 'report', '', ''),
    LINE(' '),
    DIM('MUTANTS   '),
    LINE('survived 1', { color: 'error' }),
  ])
})

const STYLE =
  ':root{--line:#e3dcd3;--fg:#2a2521;--muted:#786e65;--accent:#b35a00;--green:#3d7a3a}@media (prefers-color-scheme:dark){:root{--line:#332e29;--fg:#ebe4db;--muted:#9c9187;--accent:#ff8f40;--green:#9ccc7a}}.rail{stroke:var(--line);stroke-width:2}.fill{stroke:var(--green);stroke-width:2}.done{fill:var(--green)}.ring{fill:none;stroke:var(--accent);stroke-width:2}.dot{fill:var(--accent)}.hollow{fill:none;stroke:var(--muted);stroke-width:1.5}text{font:13px system-ui,sans-serif;fill:var(--fg)}.dim{fill:var(--muted)}.running{fill:var(--accent)}.bold{font-weight:700}'
const HOLLOW = (name: string, y: number) =>
  `<circle class="hollow" cx="10" cy="${y}" r="5"/><text class="dim" x="28" y="${y + 4}">${name}</text><text class="dim" x="130" y="${y + 4}"></text><text class="dim" x="392" y="${y + 4}" text-anchor="end"></text>`
const SPINE =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 180"><style>${STYLE}</style><line class="rail" x1="10" y1="15" x2="10" y2="165"/><line class="fill" x1="10" y1="15" x2="10" y2="45"/>` +
  '<circle class="done" cx="10" cy="15" r="5"/><text x="28" y="19">fetch</text><text class="dim" x="130" y="19"></text><text class="dim" x="392" y="19" text-anchor="end">0s</text>' +
  '<circle class="ring" cx="10" cy="45" r="6"/><circle class="dot" cx="10" cy="45" r="2.5"/><text class="bold" x="28" y="49">analyse</text><text class="dim" x="130" y="49"></text><text class="running" x="392" y="49" text-anchor="end">0s</text>' +
  `${HOLLOW('prove tests', 75)}${HOLLOW('verify', 105)}${HOLLOW('cull', 135)}${HOLLOW('report', 165)}</svg>`
const TEXT = (children: string, props: object = {}) => ({ type: 'Text', ...(Object.keys(props).length > 0 ? { props } : {}), children: [children] })
const BOX = (props: object, ...children: object[]) => ({ type: 'Box', ...(Object.keys(props).length > 0 ? { props } : {}), ...(children.length > 0 ? { children } : {}) })
const HANDLE = { plugin: 'github-pr-review', handle: 0 }
const BOLD = (color?: string) => ({ ...(color ? { color } : {}), bold: true, weight: 'semibold' })
const CAPTION = (label: string) => TEXT(label, { dimColor: true, ...BOLD() })
const CHIP = (label: string, color: string, backgroundColor: string) => TEXT(` ${label} `, { color, backgroundColor })

test('draws a review on Desktop as a title, check chips and one SVG timeline', async ($, on) => {
  await reviewing($, on, () => JSONL(PR_LINE, STEP('fetch'), STEP('analyse')))
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.drawn()).toEqual({
    ...BOX(
      { flexDirection: 'column', gap: 2, padding: 2 },
      BOX(
        { flexDirection: 'column', gap: 2 },
        BOX(
          { flexDirection: 'column' },
          TEXT('review · widgets', { dimColor: true }),
          BOX({ gap: 1 }, TEXT('#214', BOLD('permission')), TEXT(VIEW.title, BOLD())),
        ),
        BOX({ flexDirection: 'column' }, CAPTION('CHECKS'), BOX({ flexWrap: 'wrap', gap: 1 }, CHIP('✓ 1 passed', 'success', 'diffAddedDimmed'), TEXT('all passed'))),
        BOX(
          { flexDirection: 'column' },
          BOX({ justifyContent: 'space-between' }, CAPTION('REVIEW'), TEXT('0s', { dimColor: true })),
          {
            type: 'Svg',
            props: { source: SPINE, alt: '✓ fetch 0s, ● analyse 0s, ○ prove tests, ○ verify, ○ cull, ○ report' },
          },
        ),
      ),
    ),
    part: { plugin: 'github-pr-review' },
  })
  await ui.unmount()
})

test('draws an opened finding on Desktop with its path, claim and tinted why, and the mutants as a proportional bar', async ($, on) => {
  const text = JSONL(
    PR_LINE,
    STEP('fetch'),
    STEP('prove'),
    MUTANT('killed'),
    MUTANT('killed'),
    MUTANT('killed'),
    MUTANT('survived'),
    STEP('verify'),
    FINDING(1, 'IMPORTANT', 'src/a.ts', 7, 'raw query'),
    VERDICT(1, true),
    FINDING(2, 'NIT', 'src/b.ts', 12, 'rename tmp'),
  )
  await reviewing($, on, () => text)
  await $.tool.call({ tool: 'Bash', command: `: > ${SIDECAR}` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const lower = async () => {
    const tree = (await ui.drawn()) as { children: { children: object[] }[] }

    return JSON.parse(JSON.stringify(tree.children[0]!.children.slice(3)), (key, value) => (key === 'press' ? HANDLE : value))
  }
  const row = (tier: string, color: string, claim: string, hotkey: string, dim: object) =>
    BOX(
      { gap: 2, alignItems: 'center' },
      TEXT(tier, BOLD(color)),
      BOX(
        { flexGrow: 1 },
        { type: 'Button', props: { key: `finding-${hotkey}`, label: claim, hotkey, plain: true }, press: HANDLE, children: [TEXT(claim, dim)] },
      ),
      TEXT(hotkey, { dimColor: true }),
    )
  const closed = [row('IMPORTANT', 'warning', 'raw query', '1', {}), row('proving', 'permission', 'rename tmp', '2', { dimColor: true })]
  const folded = (inner: object, ...detail: object[]) => BOX({ flexDirection: 'column', gap: 1 }, inner, ...detail)
  const findings = (...inner: object[]) =>
    BOX(
      { flexDirection: 'column', gap: 1 },
      BOX({ justifyContent: 'space-between' }, CAPTION('FINDINGS'), BOX({ gap: 1 }, TEXT('1 kept'), TEXT('1 proving', { color: 'permission' }))),
      ...inner,
    )
  const mutants = BOX(
    { flexDirection: 'column', gap: 1 },
    BOX({ justifyContent: 'space-between' }, CAPTION('MUTANTS'), BOX({ gap: 2 }, TEXT('3 killed', { color: 'success' }), TEXT('1 survived', { color: 'error' }))),
    BOX({}, BOX({ flexGrow: 3, height: 1, backgroundColor: 'diffAdded' }), BOX({ flexGrow: 1, height: 1, backgroundColor: 'diffRemoved' })),
  )
  const before = await lower()
  await ui.press({ key: 'finding-1' })
  const opened = await lower()
  await ui.unmount()

  expect({ before, opened }).toEqual({
    before: [findings(...closed.map(one => folded(one))), mutants],
    opened: [
      findings(
        folded(
          closed[0]!,
          BOX(
            { flexDirection: 'column', gap: 1, paddingLeft: 2 },
            TEXT('src/a.ts:7', { dimColor: true }),
            TEXT('raw query'),
            BOX({ gap: 1, padding: 1, backgroundColor: 'diffAddedDimmed' }, TEXT('✓', { color: 'success' }), TEXT('because')),
          ),
        ),
        folded(closed[1]!),
      ),
      mutants,
    ],
  })
})
