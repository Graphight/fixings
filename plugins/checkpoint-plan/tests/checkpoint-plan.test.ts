import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { wrapped } from '../hooks/register'

const PLAN = `# Widgets

- [x] 1. First
  why
  commit: widgets: first

- [x] 2. Second
  commit: widgets: second

- [ ] 3. Third
  commit: widgets: third

- [ ] 4. Fourth
  commit: widgets: fourth
`
const ELSEWHERE = `# Champion

- [x] 1. Alpha

- [ ] 2. Beta

- [ ] 3. Gamma
`
const PANE = {
  plugin: 'checkpoint-plan',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'plan-timeline',
  viewport: { columns: 80, rows: 24 },
  props: {
    title: 'Plan timeline',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const SIZED = (rows: number) => ({ ...PANE, viewport: { columns: 80, rows }, props: { ...PANE.props, scroll: { offset: 0, bodyRows: rows - 4 } } })
const FILLED = { flexDirection: 'column', width: 80, minHeight: 20 }
const LINE = (text: string, props: object = {}) => ({ text, props })
const ELASTIC = (text: string, props: object = {}) => LINE(text, { wrap: 'truncate-end', ...props })
const SHRINKLESS = { flexShrink: 0 }
const CHIP = (text: string, props: object = {}) => ({ text, props: { weight: 'semibold', ...props } })
const ENDED = { color: 'error', weight: 'semibold' }
const HALTED_CHIP = CHIP('  HALTED', { color: 'error' })
const STOPPED_CHIP = CHIP('  STOPPED', { color: 'error' })
const OPEN_CHIP = CHIP('  PR OPEN', { color: 'success' })
const HEADING = (name: string, chip?: object, nameProps: object = { dimColor: true }) => [
  { text: name, props: nameProps },
  ...(chip ? [chip] : []),
]
const ROW = (...cells: object[]) => cells.flat()
const PLAN_ROW = ROW
const AGENT_ROW = ROW
const SIDECAR_ROW = ROW
const STORE_ROW = ROW
const BLANK = ELASTIC(' ')
const MARK = (text: string, props: object) => LINE(text.padEnd(12), props)
const TOP = (left = 'plan · widgets') => [
  LINE(left, DIM),
  LINE('/plan-timeline', DIM),
  BLANK,
]
const JOURNEY = (chip?: object) => HEADING('JOURNEY', chip)
const PREFLIGHT = (gate?: string) =>
  PLAN_ROW(MARK('✓ preflight', { color: 'success' }), ...(gate ? [LINE('gate ', { dimColor: true }), ELASTIC(gate)] : []))
const PREFLIGHT_OFF = PLAN_ROW(MARK('○ preflight', { dimColor: true }))
const STAGES_ROW = {
  done: (...detail: object[]) => PLAN_ROW(MARK('✓ stages', { color: 'success' }), JOINED(...detail)),
  running: (...detail: object[]) => PLAN_ROW(MARK('● stages', { color: 'permission', weight: 'semibold' }), JOINED(...detail)),
  halted: (...detail: object[]) => PLAN_ROW(MARK('■ stages', { color: 'error', weight: 'semibold' }), JOINED(...detail)),
  pending: (...detail: object[]) => PLAN_ROW(MARK('○ stages', { dimColor: true }), JOINED(...detail)),
}
const LEFT = (text: string) => LINE(text, { dimColor: true })
const PUSH_ROW = (isDone = false) =>
  PLAN_ROW(isDone ? MARK('✓ push', { color: 'success' }) : MARK('○ push', { dimColor: true }))
const PR_ROW = (url?: string) =>
  PLAN_ROW(...(url ? [MARK('✓ PR', { color: 'success' }), ELASTIC(url, { color: 'permission' })] : [MARK('○ PR', { dimColor: true })]))
const SEPARATOR = LINE(' · ', { dimColor: true })
const JOINED = (...cells: object[]) => cells.flatMap((cell, at) => (at === 0 ? [cell] : [SEPARATOR, cell]))
const DIM = { dimColor: true }
const hhmm = (ms: number) => {
  const date = new Date(ms)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const GUTTER = (start?: number) => LINE(`${start === undefined ? '' : hhmm(start)}`.padEnd(5) + '  ', DIM)
const TIME = (time?: string, heat = 'success') =>
  time === undefined ? LINE(' '.repeat(6)) : LINE(time.padStart(6), { color: heat })
const SHA = (sha: string) => LINE(`  ${sha}`, { color: 'permission' })
const MARKS = {
  done: { mark: '✓ ', markProps: { color: 'success' }, titleProps: {} },
  running: { mark: '● ', markProps: { color: 'permission' }, titleProps: { weight: 'semibold' } },
  halted: { mark: '■ ', markProps: { color: 'error' }, titleProps: {} },
  pending: { mark: '○ ', markProps: DIM, titleProps: DIM },
}
const STAGE = (
  state: keyof typeof MARKS,
  title: string,
  { start, time, heat, sha, isLast = false, width = 53, isButton = false }: { start?: number; time?: string; heat?: string; sha?: string; isLast?: boolean; width?: number; isButton?: boolean } = {},
) =>
  PLAN_ROW(
    GUTTER(start),
    LINE(isLast ? '└─ ' : '├─ ', DIM),
    LINE(MARKS[state].mark, MARKS[state].markProps),
    ELASTIC(isButton ? title.replace(/^\d+ /, '').padEnd(width - 3) : title.padEnd(width), MARKS[state].titleProps),
    TIME(time, heat),
    ...(sha ? [SHA(sha)] : []),
  )
const DONE = (title: string, options = {}) => STAGE('done', title, options)
const RUNNING = (title: string, options = {}) => STAGE('running', title, options)
const HALTED = (title: string, options = {}) => STAGE('halted', title, options)
const PENDING = (title: string, options = {}) => STAGE('pending', title, options)
const SPACER = PLAN_ROW(GUTTER(), LINE('│', DIM))
const DETAIL = (text: string, props: object = {}, isLast = false) =>
  PLAN_ROW(GUTTER(), LINE(isLast ? ' ' : '│', DIM), LINE(`    ${text}`, props))
const DETAILS = (lines: string[], props: object = {}) => lines.flatMap(text => DETAIL(text, props))
const NESTED = (...cells: object[]) => PLAN_ROW(GUTTER(), LINE('│', DIM), LINE('    '), ...cells)
const SPINE = (...stages: object[][]) => stages.flatMap((rows, at) => (at === 0 ? rows : [...SPACER, ...rows]))
const TIGHT = (...stages: object[][]) => stages.flat()
const TOTALS = (text: string) => PLAN_ROW(ELASTIC(`${' '.repeat(10)}${text}`, DIM))
const CALL = (head: string, summary: string, color: string) => [LINE(head, { color }), ELASTIC(`  ${summary}`)]
const NEXT_RUN = [
  BLANK,
  ...HEADING('NEXT'),
  ...PLAN_ROW(
    LINE('/ship-plan', { color: 'permission', weight: 'semibold' }),
    ELASTIC(' or /execute-stage for one stage', DIM),
  ),
]
const LAST = { isLast: true }
const START = { cwd: '/src/widgets', surface: 'terminal', isInteractive: true } as const

const world = (on: On, plan: () => string, elsewhere?: string, sidecar?: () => string, newHead?: (argv: readonly string[]) => string | null) => {
  mock.env(on, { HOME: '/home/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const sha = e.argv.includes('--short=7') ? (newHead?.(e.argv) ?? null) : undefined

    return {
      value: {
        exitCode: sha === null ? 128 : 0,
        stdout: sha === undefined ? '/src/widgets\nfeat/bands\n' : sha === null ? '' : `${sha}\n`,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.read', ($, e) => {
    if (e.path === '/home/me/.claude/plans/widgets-feat-bands.md') {
      return { value: plan() }
    }

    if (sidecar !== undefined && e.path === '/home/me/.claude/plans/widgets-feat-bands.run.jsonl') {
      return { value: sidecar() }
    }

    return elsewhere !== undefined && e.path === '/home/me/.claude/plans/widgets-champion-champion.md'
      ? { value: elsewhere }
      : { deny: `unexpected read of ${e.path}` }
  })

  return mock.clock(on)
}

const held = (on: On) => {
  const atoms = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: atoms.get(e.key), version: 0 } }))
  on('state.set', (_, e) => {
    atoms.set(e.key, e.value)

    return { value: { isSet: true, version: 0 } }
  })

  return atoms
}

test('toasts once when the last stage is ticked', async ($, on) => {
  let plan = PLAN
  const toasts: string[] = []
  world(on, () => plan)
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', () => ({ result: '' }))

  await $.session.start(START)
  plan = PLAN.replaceAll('- [ ]', '- [x]')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'true' })

  expect(toasts).toEqual(['Plan complete: all 4 stages done'])
})

test('lists each stage as done, running or pending in the timeline pane', async ($, on) => {
  world(on, () => PLAN)

  await $.session.start(START)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('0s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), RUNNING('3 Third', { time: '0s' }), PENDING('4 Fourth', LAST)),
    ...NEXT_RUN,
  ])
})

test('times each stage finished and running in the timeline pane', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan)
  on('tool.call', () => ({ result: '' }))

  await $.session.start(START)
  await clock.advance(90_000)
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(5_000)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('4 of 4'), LINE('1m35s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), DONE('3 Third', { time: '1m30s' }), RUNNING('4 Fourth', { time: '5s', ...LAST })),
    ...NEXT_RUN,
  ])
})

test('lists the sub-agent calls under the running stage and clears them when it finishes', async ($, on) => {
  let plan = PLAN
  world(on, () => plan)
  on('tool.call', (_, e) => ({ result: e.tool === 'Agent' ? { agentId: 'worker' } : '' }))

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'main loop' })
  await $.tool.call({ tool: 'Agent', description: 'Look around', subagent_type: 'Explore' })
  await $.tool.call({ tool: 'Bash', command: 'one', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'two', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'three', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'four', agentId: 'worker' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('0s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), RUNNING('3 Third', { time: '0s' }), PENDING('4 Fourth', LAST)),
    BLANK,
    ...HEADING('NOW'),
    ...AGENT_ROW(ELASTIC('4 calls · 0 edits · 0 tests · 0 errors')),
    ...AGENT_ROW(CALL('✓ Bash', 'two', 'success')),
    ...AGENT_ROW(CALL('✓ Bash', 'three', 'success')),
    ...AGENT_ROW(CALL('✓ Bash', 'four', 'success')),
  ])

  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const after = await ui.findAll({ type: 'Text' })

  expect(after.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('4 of 4'), LINE('0s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), DONE('3 Third', { time: '0s' }), RUNNING('4 Fourth', { time: '0s', ...LAST })),
    ...NEXT_RUN,
  ])
})

test('toasts a fallback when ship-plan starts and the timeline pane is not placed', async ($, on) => {
  const toasts: string[] = []
  world(on, () => PLAN)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'terminal too narrow' } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  const other = await $.skill.prompt({ skill: 'commit', text: 'c' })
  const prompt = await $.skill.prompt({ skill: 'dot_files:ship-plan', text: 's' })

  expect({ other, prompt, toasts }).toEqual({
    other: { text: 'c' },
    prompt: { text: 's' },
    toasts: ['Widen the terminal or run /plan-timeline'],
  })
})

test('opens the timeline when ship-plan expands, bare or namespaced, and not for another skill or a prompt naming it', async ($, on) => {
  const opened: string[] = []
  world(on, () => PLAN)
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  await $.prompt.submit({ text: 'what does /ship-plan do?' })
  await $.skill.prompt({ skill: 'commit', text: '' })
  const before = [...opened]
  await $.skill.prompt({ skill: 'ship-plan', text: '' })
  await $.skill.prompt({ skill: 'dot_files:ship-plan', text: '' })

  expect({ before, opened }).toEqual({ before: [], opened: ['plan-timeline', 'plan-timeline'] })
})

test('records the main loop gate, commit, push and PR calls and not the sub-agent or other calls', async ($, on) => {
  const results: Record<string, { result: string; text: string; isError?: boolean }> = {
    'claude plugin test mod': { result: '', text: 'FAIL', isError: true },
    'git commit -m "add test"': { result: '', text: '[feat/bands 4f9a2c1] add test\n 1 file changed' },
    'git push -u origin feat/bands': { result: '', text: 'done' },
    'gh pr create --fill': { result: '', text: 'no url here' },
    'gh pr view': { result: '', text: 'https://github.com/me/widgets/pull/42\n' },
  }
  const clock = world(on, () => PLAN)
  const atoms = held(on)
  on('tool.call', async (_, e) => {
    await clock.advance(2_000)

    return results[String(e.command)] ?? { result: '', text: '' }
  })

  await $.session.start(START)
  for (const command of Object.keys(results)) {
    await $.tool.call({ tool: 'Bash', command })
  }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'worker' })
  await $.tool.call({ tool: 'Read', file_path: '/src/build' })

  expect(atoms.get('run')).toEqual([
    { kind: 'gate', stage: null, command: 'claude plugin test mod', isError: true, durationMs: 2_000, at: 2_000 },
    { kind: 'commit', stage: null, sha: '4f9a2c1', at: 4_000 },
    { kind: 'push', at: 6_000 },
    { kind: 'pr', url: null, at: 8_000 },
    { kind: 'pr', url: 'https://github.com/me/widgets/pull/42', at: 10_000 },
  ])
})

const QUIET_COMMIT = 'git add tides.sh && git commit -q -m "widgets: fifth" && git log --oneline -2'

test('reads a quiet commit call\'s sha from git', async ($, on) => {
  const calls: (readonly string[])[] = []
  world(on, () => PLAN, undefined, undefined, argv => {
    calls.push(argv)

    return '9c0ffee'
  })
  const atoms = held(on)
  on('tool.call', () => ({ result: '', text: '8d1e2f3 widgets: fifth\n' }))

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: QUIET_COMMIT })

  expect({ run: atoms.get('run'), calls }).toEqual({
    run: [{ kind: 'commit', stage: null, sha: '9c0ffee', at: 0 }],
    calls: [['git', 'rev-parse', '--short=7', 'HEAD']],
  })
})

test('asks git at the path the commit used and not at all after an errored commit', async ($, on) => {
  const calls: (readonly string[])[] = []
  world(on, () => PLAN, undefined, undefined, argv => {
    calls.push(argv)

    return '1234abc'
  })
  const atoms = held(on)
  on('tool.call', (_, e) => (e.command === 'git commit -m bad' ? { result: '', text: '[x 7777777] bad', isError: true } : { result: '', text: '' }))

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'git -C /some/path add -A && git -C /some/path commit -m ok' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m bad' })

  expect({ run: atoms.get('run'), calls }).toEqual({
    run: [
      { kind: 'commit', stage: null, sha: '1234abc', at: 0 },
      { kind: 'commit', stage: null, sha: null, at: 0 },
    ],
    calls: [['git', '-C', '/some/path', 'rev-parse', '--short=7', 'HEAD']],
  })
})

test('asks git in the session checkout when the commit named its path through a shell variable', async ($, on) => {
  const calls: (readonly string[])[] = []
  world(on, () => PLAN, undefined, undefined, argv => {
    calls.push(argv)

    return argv.includes('$R') ? null : 'a8af03b'
  })
  const atoms = held(on)
  on('tool.call', () => ({ result: '', text: 'a8af03b tides: add the evening high tide\n' }))

  await $.session.start(START)
  await $.tool.call({
    tool: 'Bash',
    command: 'R=/src/widgets; git -C $R add tides.sh && git -C $R commit -q -m "tides: add the evening high tide" && git -C $R log --oneline -1',
  })

  expect({ run: atoms.get('run'), calls }).toEqual({
    run: [{ kind: 'commit', stage: null, sha: 'a8af03b', at: 0 }],
    calls: [
      ['git', '-C', '$R', 'rev-parse', '--short=7', 'HEAD'],
      ['git', 'rev-parse', '--short=7', 'HEAD'],
    ],
  })
})

test('falls back to the sha git printed when the process call fails', async ($, on) => {
  world(on, () => PLAN)
  const atoms = held(on)
  on('tool.call', () => ({ result: '', text: '[feat/bands 4f9a2c1] add test' }))

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add test"' })

  expect(atoms.get('run')).toEqual([{ kind: 'commit', stage: null, sha: '4f9a2c1', at: 0 }])
})

test('takes the sha git printed over the session checkout when the commit ran in another directory', async ($, on) => {
  const calls: (readonly string[])[] = []
  world(on, () => PLAN, undefined, undefined, argv => {
    calls.push(argv)

    return 'deadbee'
  })
  const atoms = held(on)
  on('tool.call', (_, e) =>
    e.command.includes('-q') ? { result: '', text: '' } : { result: '', text: '[main 1a2b3c4] pantry: add more items\n 1 file changed' },
  )

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'cd /tmp/pantry && git add -A && git commit -m "pantry: add more items"' })
  await $.tool.call({ tool: 'Bash', command: 'cd "/tmp/pantry" && git commit -q -m "pantry: sort"' })

  expect({ run: atoms.get('run'), calls }).toEqual({
    run: [
      { kind: 'commit', stage: null, sha: '1a2b3c4', at: 0 },
      { kind: 'commit', stage: null, sha: 'deadbee', at: 0 },
    ],
    calls: [['git', '-C', '/tmp/pantry', 'rev-parse', '--short=7', 'HEAD']],
  })
})

test('records a stage sub-agent from its spawn, its own calls and its turn.complete', async ($, on) => {
  const clock = world(on, () => PLAN)
  const atoms = held(on)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: 'worker', description: 'Execute plan stage 3' }, text: '' }
    }

    return e.command === 'npm test' ? { result: '', text: 'FAIL', isError: true } : { result: '', text: '' }
  })

  await $.session.start(START)
  await $.tool.call({
    tool: 'Agent',
    description: 'Execute plan stage 3',
    subagent_type: 'plan-executor',
  })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Write', file_path: '/src/b.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'worker' })
  await clock.advance(5_000)
  await $.turn.complete({
    answer: 'done',
    durationMs: 5_000,
    isAborted: false,
    turnId: 't1',
    agentId: 'worker',
    reason: 'answer',
  })

  expect(atoms.get('stages')).toEqual([
    {
      stage: 3,
      agentId: 'worker',
      start: 0,
      durationMs: 5_000,
      calls: 5,
      edits: 3,
      tests: 1,
      errors: 1,
      files: ['/src/a.ts', '/src/b.ts'],
      recent: [
        { tool: 'Write', summary: '/src/b.ts', isDone: true, isError: false },
        { tool: 'Bash', summary: 'npm test', isDone: true, isError: true },
        { tool: 'Bash', summary: 'ls', isDone: true, isError: false },
      ],
    },
  ])

  const settled = atoms.get('stages')
  await $.tool.call({ tool: 'Bash', command: 'true', agentId: 'fork' })
  await $.turn.complete({
    answer: 'done',
    durationMs: 1,
    isAborted: false,
    turnId: 't2',
    agentId: 'fork',
    reason: 'answer',
  })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(atoms.get('stages')).toEqual(settled)
  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('5s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), RUNNING('3 Third', { start: 0, time: '5s', isButton: true }), PENDING('4 Fourth', LAST)),
    ...NEXT_RUN,
  ])
})

test('takes a sub-agent stage from the first unticked box when its description holds no number', async ($, on) => {
  world(on, () => PLAN)
  const atoms = held(on)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) =>
    e.tool === 'Agent'
      ? { result: { status: 'async_launched', agentId: 'worker' }, text: '' }
      : { result: '', text: e.command === 'git commit -m third' ? '[feat/bands a41c9e2] third' : '' },
  )

  await $.session.start(START)
  await $.tool.call({ tool: 'Agent', description: 'Build the widget', subagent_type: 'plan-executor' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })

  expect(atoms.get('run')).toEqual([
    { kind: 'gate', stage: 3, command: 'npm test', isError: false, durationMs: 0, at: 0 },
    { kind: 'commit', stage: 3, sha: 'a41c9e2', at: 0 },
  ])
})

test('opens a stage row from a forked execute-stage skill call and attributes the sub-agent call to it', async ($, on) => {
  world(on, () => PLAN)
  const atoms = held(on)
  on('tool.call', () => ({ result: '', text: '' }))

  await $.session.start(START)
  await $.tool.call({ tool: 'Skill', skill: 'execute-stage' })
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'fork' })

  expect(atoms.get('stages')).toMatchObject([{ stage: 3, agentId: 'fork', calls: 1 }])
})

test('draws a scripted run as JOURNEY, STAGES and NOW blocks', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan)
  held(on)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: e.description === 'Execute plan stage 3' ? 'worker' : 'next' }, text: '' }
    }

    if (e.command === 'npm test') {
      await clock.advance(8_000)
    }

    return e.command === 'git commit -m third'
      ? { result: '', text: '[feat/bands a41c9e2] third' }
      : { result: '', text: '' }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'worker' })
  await clock.advance(30_000)
  await $.turn.complete({ answer: 'done', durationMs: 30_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 4', subagent_type: 'plan-executor' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/b.ts', agentId: 'next' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('4 of 4'), LINE('38s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      DONE('2 Second'),
      DONE('3 Third', { start: 0, time: '30s', sha: 'a41c9e2', isButton: true }),
      RUNNING('4 Fourth', { start: 38_000, time: '0s', ...LAST }),
    ),
    BLANK,
    ...HEADING('NOW · stage 4'),
    ...AGENT_ROW(ELASTIC('1 call · 1 edit · 0 tests · 0 errors')),
    ...AGENT_ROW(CALL('✓ Edit', '/src/b.ts', 'success')),
  ])
})

test('opens a stage\'s note, counts, edited files and calls on a press of its Button and closes them on the next', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan, undefined, () => '{"kind":"stage","n":3,"outcome":"as-planned","note":"tidy"}\n')
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: 'worker' }, text: '' }
    }

    return e.command === 'git commit -m third'
      ? { result: '', text: '[feat/bands a41c9e2] third' }
      : { result: '', text: '' }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await $.tool.call({ tool: 'Read', file_path: '/src/read.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'worker' })
  for (const name of ['b', 'c', 'd', 'e', 'f', 'g']) {
    await $.tool.call({ tool: 'Write', file_path: `/src/${name}.ts`, agentId: 'worker' })
  }
  await clock.advance(30_000)
  await $.turn.complete({ answer: 'done', durationMs: 30_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  const ui = await $.ui.mount(SIZED(40))
  const drawn = async () => (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  const stages = (third: object[]) => [
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('4 of 4'), LINE('30s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), third, RUNNING('4 Fourth', { time: '0s', ...LAST })),
    ...NEXT_RUN,
  ]
  const closed = DONE('3 Third', { start: 0, time: '30s', sha: 'a41c9e2', isButton: true })
  const before = await drawn()
  const buttons = (await ui.findAll({ type: 'Button' })).map(({ props }) => props)

  await ui.press({ key: 'stage-3' })
  const opened = await drawn()
  await ui.press({ key: 'stage-3' })
  const after = await drawn()

  expect({ buttons, before, opened, after }).toEqual({
    buttons: [{ key: 'stage-3', label: 'Third'.padEnd(50), hotkey: '3', plain: true }],
    before: stages(closed),
    opened: stages([
      ...closed,
      ...DETAIL('as-planned: tidy'),
      ...NESTED(ELASTIC('10 calls · 8 edits · 0 tests · 0 errors')),
      ...['a', 'b', 'c', 'd', 'e'].flatMap(name => NESTED(ELASTIC(`/src/${name}.ts`, { wrap: 'truncate-start' }))),
      ...NESTED(ELASTIC('+2 more', DIM)),
      ...NESTED(...CALL('✓ Write', '/src/e.ts', 'success')),
      ...NESTED(...CALL('✓ Write', '/src/f.ts', 'success')),
      ...NESTED(...CALL('✓ Write', '/src/g.ts', 'success')),
    ]),
    after: stages(closed),
  })
})

test('draws a stage with only an as-planned note as a Button, with no hotkey from stage ten', async ($, on) => {
  const titles = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
  world(
    on,
    () => `# Widgets\n\n${titles.map((title, at) => `- [${at < 8 ? 'x' : ' '}] ${at + 1}. ${title}`).join('\n\n')}\n`,
    undefined,
    () => '{"kind":"stage","n":9,"outcome":"as-planned","note":"tidy"}\n{"kind":"stage","n":10,"outcome":"as-planned","note":"neat"}\n',
  )

  await $.session.start(START)
  const ui = await $.ui.mount(SIZED(60))
  const buttons = (await ui.findAll({ type: 'Button' })).map(({ props }) => props)
  await ui.press({ key: 'stage-10' })
  const opened = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))

  expect({ buttons, opened }).toEqual({
    buttons: [
      { key: 'stage-9', label: 'Ninth'.padEnd(50), hotkey: '9', plain: true },
      { key: 'stage-10', label: '10 Tenth'.padEnd(53), plain: true },
    ],
    opened: [
      ...TOP(),
      ...JOURNEY(),
      ...PREFLIGHT(),
      ...STAGES_ROW.running(LINE('9 of 10'), LINE('0s')),
      BLANK,
      ...HEADING('STAGES'),
      ...SPINE(
        ...titles.slice(0, 8).map((title, at) => DONE(`${at + 1} ${title}`)),
        RUNNING('9 Ninth', { time: '0s', isButton: true }),
        [...PENDING('10 Tenth', LAST), ...DETAIL('as-planned: neat', {}, true)],
      ),
      ...NEXT_RUN,
    ],
  })
})

const BEFORE_FILES = { agentId: 'old', start: 0, calls: 2, edits: 1, tests: 0, errors: 0, recent: [{ tool: 'Edit', summary: '/src/a.ts', isDone: true, isError: false }] }

test('opens a stage whose record was kept from before the files field', async ($, on) => {
  world(on, () => PLAN)
  const atoms = held(on)

  await $.session.start(START)
  atoms.set('stages', [{ ...BEFORE_FILES, stage: 2, durationMs: 20_000 }])
  atoms.set('expanded', 2)
  const ui = await $.ui.mount(SIZED(40))

  expect((await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('0s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      [
        ...DONE('2 Second', { start: 0, time: '20s', isButton: true }),
        ...NESTED(ELASTIC('2 calls · 1 edit · 0 tests · 0 errors')),
        ...NESTED(...CALL('✓ Edit', '/src/a.ts', 'success')),
      ],
      RUNNING('3 Third', { time: '0s' }),
      PENDING('4 Fourth', LAST),
    ),
    ...NEXT_RUN,
  ])
})

test('records an edit on a running stage whose record was kept from before the files field', async ($, on) => {
  world(on, () => PLAN)
  const atoms = held(on)
  on('tool.call', () => ({ result: '' }))

  await $.session.start(START)
  atoms.set('stages', [{ ...BEFORE_FILES, stage: 3, durationMs: null }])
  await $.tool.call({ tool: 'Edit', file_path: '/src/b.ts', agentId: 'old' })

  expect(atoms.get('stages')).toEqual([
    {
      ...BEFORE_FILES,
      stage: 3,
      durationMs: null,
      calls: 3,
      edits: 2,
      files: ['/src/b.ts'],
      recent: [...BEFORE_FILES.recent, { tool: 'Edit', summary: '/src/b.ts', isDone: true, isError: false }],
    },
  ])
})

const SIDECAR = [
  '{"kind":"gate","command":"npm test"}',
  '{"kind":"stage","n":1,"outcome":"as-planned"}',
  'not json',
  '{"kind":"stage","n":2,"outcome":"diverged","note":"kept the old key"}',
].join('\n')
const SHIP = { skill: 'ship-plan', text: '' }
const shipRun = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On, sidecar: () => string) => {
  world(on, () => PLAN, undefined, sidecar)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: '', text: '' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Bash', command: 'true' })
}

test('puts sidecar outcomes on the stage rows and skips a line that is not JSON', async ($, on) => {
  await shipRun($, on, () => SIDECAR)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT('npm test'),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('0s'), LEFT('~10m left')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      [...DONE('2 Second'), ...DETAIL('diverged: kept the old key')],
      RUNNING('3 Third', { time: '0s' }),
      PENDING('4 Fourth', LAST),
    ),
  ])
})

const NOTE = (note: string) =>
  ['{"kind":"gate","command":"npm test"}', '{"kind":"stage","n":1,"outcome":"as-planned"}', `{"kind":"stage","n":2,"outcome":"diverged","note":"${note}"}`].join('\n')
const LONG_NOTE = 'repo atom is written in here() (reached from refresh via target), so the pane reads it back on every redraw'
const WORDS = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty '

const noted = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On, note: string) => {
  await shipRun($, on, () => NOTE(note))
  const ui = await $.ui.mount(PANE)

  return (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
}
const STAGES_AFTER_NOTE = (lines: string[]) => [
  ...TOP('ship-plan · widgets'),
  ...JOURNEY(),
  ...PREFLIGHT('npm test'),
  ...STAGES_ROW.running(LINE('3 of 4'), LINE('0s'), LEFT('~10m left')),
  ...PUSH_ROW(),
  ...PR_ROW(),
  BLANK,
  ...HEADING('STAGES'),
  ...SPINE(
    DONE('1 First'),
    [...DONE('2 Second'), ...DETAILS(lines)],
    RUNNING('3 Third', { time: '0s' }),
    PENDING('4 Fourth', LAST),
  ),
]

test('wraps a long note onto a second row that repeats the gutter and the spine', async ($, on) => {
  const drawn = await noted($, on, LONG_NOTE)

  expect(drawn).toEqual(
    STAGES_AFTER_NOTE(['diverged: repo atom is written in here() (reached from refresh via', 'target), so the pane reads it back on every redraw']),
  )
})

test('ends the third row of a note that needs more rows with an ellipsis', async ($, on) => {
  const drawn = await noted($, on, WORDS.repeat(3).trim())

  expect(drawn).toEqual(
    STAGES_AFTER_NOTE([
      'diverged: one two three four five six seven eight nine ten eleven',
      'twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen',
      'twenty one two three four five six seven eight nine ten eleven…',
    ]),
  )
})

test('holds each fixed segment in a Box that does not shrink', async ($, on) => {
  await shipRun($, on, () => SIDECAR)
  const ui = await $.ui.mount(PANE)
  const texts = await ui.findAll({ type: 'Text' })
  const boxes = await ui.findAll({ type: 'Box' })

  expect(boxes.map(({ props: { key, ...props } }) => props).filter(props => props.flexShrink !== undefined)).toEqual(
    texts.slice(2).filter(({ props }) => props.wrap === undefined).map(() => SHRINKLESS),
  )
})

test('breaks a word longer than the width at the width and wraps at spaces otherwise', () => {
  expect({
    long: wrapped('ab abcdefghijklmnopqrstuvwxyz cd', 10),
    spaced: wrapped('one two three', 7),
    short: wrapped('one', 7),
    cut: wrapped('abcdefghijklmnopqrstuvwxyz', 5, 2),
  }).toEqual({
    long: ['ab', 'abcdefghij', 'klmnopqrs…'],
    spaced: ['one two', 'three'],
    short: ['one'],
    cut: ['abcde', 'fghi…'],
  })
})

test('starts the detail row in the column of the stage number', async ($, on) => {
  await shipRun($, on, () => SIDECAR)
  const ui = await $.ui.mount(PANE)

  const texts = (await ui.findAll({ type: 'Text' })).map(({ text }) => text)
  const detail = texts.findIndex(text => text.trim() === 'diverged: kept the old key')
  const title = texts.findIndex(text => text.startsWith('2 Second'))

  expect(texts.slice(detail - 2, detail + 1).join('').indexOf('diverged')).toEqual(texts.slice(title - 3, title).join('').length)
})

test('fills the run pane over its whole body and sets no background', async ($, on) => {
  await shipRun($, on, () => SIDECAR)
  const run = await $.ui.mount(PANE)

  expect((await run.findAll({ type: 'Box' })).map(({ props }) => props).slice(0, 1)).toEqual([FILLED])
})

test('fills the idle pane over its whole body and sets no background', async ($, on) => {
  world(on, PLAN_COMPLETE)
  stored(on, {})
  await $.session.start(START)
  const ui = await $.ui.mount(PANE)

  expect((await ui.findAll({ type: 'Box' })).map(({ props }) => props).slice(0, 1)).toEqual([FILLED])
})

test('draws a halt line as the HALTED chip, a halted stages row and the NEEDS YOU reason', async ($, on) => {
  await shipRun($, on, () => `${SIDECAR}\n{"kind":"halt","stage":3,"reason":"gate failed","needs":"2 tests in StainTests"}\n`)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(HALTED_CHIP),
    ...PREFLIGHT('npm test'),
    ...STAGES_ROW.halted(LINE('halted at 3 of 4'), LINE('0s')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('NEEDS YOU', undefined, ENDED),
    ...ROW(ELASTIC('gate failed', { wrap: 'wrap', color: 'error' })),
    ...ROW(ELASTIC('2 tests in StainTests', { wrap: 'wrap' })),
    BLANK,
    ...HEADING('STAGES'),
    ...TIGHT(
      DONE('1 First'),
      [...DONE('2 Second'), ...DETAIL('diverged: kept the old key')],
      HALTED('3 Third', { time: '0s' }),
      PENDING('4 Fourth', LAST),
    ),
  ])
})

test('shows STOPPED when the main loop ends its turn mid-run with nothing recorded', async ($, on) => {
  await shipRun($, on, () => '')
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(STOPPED_CHIP),
    ...PREFLIGHT(),
    ...STAGES_ROW.halted(LINE('stopped at 3 of 4'), LINE('0s')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('NEEDS YOU', undefined, ENDED),
    ...ROW(ELASTIC('no reason recorded', { wrap: 'wrap', color: 'error' })),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), RUNNING('3 Third', { time: '0s' }), PENDING('4 Fourth', LAST)),
  ])
})

test('notifies once for a stop, each new halt line and the first PR url, and not for a sidecar from before the run', async ($, on) => {
  const STALE = '{"kind":"halt","stage":2,"reason":"left over","needs":"nothing"}\n'
  const HALT = '{"kind":"halt","stage":3,"reason":"gate failed","needs":"2 tests"}\n'
  const AGAIN = '{"kind":"halt","stage":3,"reason":"gate failed again","needs":"1 test"}\n'
  const URL = 'https://github.com/me/widgets/pull/7'
  let sidecar = STALE
  let text = ''
  const sent: unknown[] = []
  world(on, () => PLAN, undefined, () => sidecar)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: '', text }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', (_, e) => {
    sent.push(e)

    return { value: { isSent: false, reason: 'no-channel' } }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.skill.prompt(SHIP)
  sidecar = ''
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  sidecar = HALT
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  sidecar = HALT + AGAIN
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  text = URL
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })

  expect(sent).toEqual([
    { text: 'ship-plan stopped at stage 3, no reason recorded', title: 'ship-plan' },
    { text: 'ship-plan halted at stage 3: gate failed', title: 'ship-plan' },
    { text: 'ship-plan halted at stage 3: gate failed again', title: 'ship-plan' },
    { text: `ship-plan opened ${URL}`, title: 'ship-plan' },
  ])
})

const AT = Date.UTC(2026, 9, 9, 0, 30)
const LOCAL_DAY = `${String(new Date(AT).getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date(AT).getMonth()]}`
const seeded = (id: number, durationMs: number | null, wallMs: number | null, repo = 'widgets') => ({
  repo,
  plan: 'widgets-feat-bands.md',
  endedAt: AT + id * 1_000,
  outcome: 'pr' as const,
  totalMs: 600_000,
  stages: [{ n: 1, durationMs, wallMs }],
})
const TEN = Array.from({ length: 10 }, (_, index) => seeded(index, (index + 1) * 10_000, (index + 1) * 30_000))
const stored = (on: On, entries: Record<string, unknown> = {}) => {
  const kept = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })

  return kept
}

test('stores one summary for a run that halts and then opens its PR', async ($, on) => {
  const URL = 'https://github.com/me/widgets/pull/9'
  let plan = PLAN
  let sidecar = ''
  let text = ''
  const clock = world(on, () => plan, undefined, () => sidecar)
  const kept = stored(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) =>
    e.tool === 'Agent' ? { result: { agentId: 'worker' }, text: '' } : { result: '', text },
  )

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await clock.advance(60_000)
  await $.turn.complete({ answer: 'done', durationMs: 60_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  await clock.advance(5_000)
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  sidecar = '{"kind":"halt","stage":4,"reason":"gate failed","needs":"1 test"}\n'
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(10_000)
  text = URL
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })

  const stage = { n: 3, durationMs: 60_000, wallMs: 65_000 }
  const base = { repo: 'widgets', plan: 'widgets-feat-bands.md' }
  expect(kept.get('runs')).toEqual([{ ...base, startedAt: 0, endedAt: 75_000, outcome: 'pr', totalMs: 75_000, stages: [stage] }])
})

test('stores and notifies once for a stop although later tool calls and turn ends repeat it', async ($, on) => {
  const clock = world(on, () => PLAN)
  const kept = stored(on)
  const sent: unknown[] = []
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', (_, e) => {
    sent.push(e)

    return { value: { isSent: false, reason: 'no-channel' } }
  })
  on('tool.call', () => ({ result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await clock.advance(10_000)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(10_000)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })

  expect(sent).toEqual([{ text: 'ship-plan stopped at stage 3, no reason recorded', title: 'ship-plan' }])
  expect(kept.get('runs')).toEqual([
    {
      repo: 'widgets',
      plan: 'widgets-feat-bands.md',
      startedAt: 0,
      endedAt: 20_000,
      outcome: 'stopped',
      totalMs: 20_000,
      stages: [],
    },
  ])
})

test('keeps a ship run open after every box is ticked until its PR url is recorded', async ($, on) => {
  const URL = 'https://github.com/me/widgets/pull/9'
  let plan = PLAN
  let text = ''
  const clock = world(on, () => plan)
  const kept = stored(on)
  const sent: unknown[] = []
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', (_, e) => {
    sent.push(e)

    return { value: { isSent: false, reason: 'no-channel' } }
  })
  on('tool.call', () => ({ result: '', text }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await clock.advance(10_000)
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.').replace('- [ ] 4.', '- [x] 4.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(10_000)
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })
  text = URL
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })

  expect(sent).toEqual([{ text: `ship-plan opened ${URL}`, title: 'ship-plan' }])
  expect(kept.get('runs')).toEqual([
    {
      repo: 'widgets',
      plan: 'widgets-feat-bands.md',
      startedAt: 0,
      endedAt: 20_000,
      outcome: 'pr',
      totalMs: 10_000,
      stages: [{ n: 3, durationMs: null, wallMs: 10_000 }],
    },
  ])
})

test('counts a run from when ship-plan starts, not from when the plan was first seen', async ($, on) => {
  const URL = 'https://github.com/me/widgets/pull/9'
  let plan = PLAN
  let text = ''
  const clock = world(on, () => plan)
  const kept = stored(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('tool.call', () => ({ result: '', text }))

  await $.session.start(START)
  await clock.advance(50_000)
  await $.skill.prompt(SHIP)
  await clock.advance(10_000)
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.').replace('- [ ] 4.', '- [x] 4.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(10_000)
  text = URL
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })

  expect(kept.get('runs')).toEqual([
    {
      repo: 'widgets',
      plan: 'widgets-feat-bands.md',
      startedAt: 50_000,
      endedAt: 70_000,
      outcome: 'pr',
      totalMs: 10_000,
      stages: [{ n: 3, durationMs: null, wallMs: 10_000 }],
    },
  ])
})

test('colours stage times against the stored p50 and p90 and estimates the time left', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan)
  stored(on, { runs: TEN })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) =>
    e.tool === 'Agent'
      ? { result: { agentId: e.description === 'Execute plan stage 3' ? 'worker' : 'next' }, text: '' }
      : { result: '', text: '' },
  )

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await clock.advance(95_000)
  await $.turn.complete({ answer: 'done', durationMs: 95_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 4', subagent_type: 'plan-executor' })
  await clock.advance(60_000)
  const ui = await $.ui.mount(SIZED(40))

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('4 of 4'), LINE('2m35s'), LEFT('~2m left')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      DONE('2 Second'),
      DONE('3 Third', { start: 0, time: '1m35s', heat: 'error', isButton: true }),
      RUNNING('4 Fourth', { start: 95_000, time: '1m00s', heat: 'warning', ...LAST }),
    ),
    BLANK,
    ...HEADING('NOW · stage 4'),
    ...AGENT_ROW(ELASTIC('0 calls · 0 edits · 0 tests · 0 errors')),
  ])
})

test('uses the measured constants until ten runs are stored', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan)
  stored(on, { runs: TEN.slice(1) })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => (e.tool === 'Agent' ? { result: { agentId: 'worker' }, text: '' } : { result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await clock.advance(100_000)
  const ui = await $.ui.mount(SIZED(26))

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('1m40s'), LEFT('~9m left')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      DONE('2 Second'),
      RUNNING('3 Third', { start: 0, time: '1m40s', heat: 'warning' }),
      PENDING('4 Fourth', LAST),
    ),
    BLANK,
    ...HEADING('NOW · stage 3'),
    ...AGENT_ROW(ELASTIC('0 calls · 0 edits · 0 tests · 0 errors')),
  ])
})

const PLAN_COMPLETE = () => PLAN.replaceAll('- [ ]', '- [x]')
const RUN_ROW = (date: string, stages: string, total: string, outcome: string, color: string) =>
  STORE_ROW(
    LINE(date, DIM),
    ELASTIC(`  ${stages.padEnd(9)}  ${total.padStart(7)}  `),
    LINE(outcome, { color }),
  )
const TIMES = (p50: string, p90: string, ...source: object[]) => [
  ...HEADING('YOUR STAGE TIMES'),
  ...STORE_ROW(ELASTIC(`typical  ${p50.padEnd(7)} `), LINE('p50', DIM)),
  ...STORE_ROW(ELASTIC(`slow     ${p90.padEnd(7)} `), LINE('p90', DIM)),
  ...STORE_ROW(...source),
]
const MEASURED = (count: number) => ELASTIC(`measured 09 Oct · ${count} of 10 runs stored`, { color: 'permission' })
const NO_PLAN = 'no plan on this branch'
const NEXT_IDLE = (note: string) => [
  ...HEADING('NEXT'),
  ...PLAN_ROW(ELASTIC(note, DIM)),
  ...PLAN_ROW(ELASTIC('/checkpoint-plan', { color: 'permission', weight: 'semibold' })),
]

test('draws the last runs, stage times and next step of this repo when no run is active', async ($, on) => {
  world(on, PLAN_COMPLETE)
  stored(on, {
    runs: [
      ...TEN,
      seeded(10, 1, 1, 'other'),
      ...Array.from({ length: 5 }, (_, index) => ({ ...seeded(index + 11, 1, 1), outcome: (['halted', 'stopped', 'pr', 'pr', 'pr'] as const)[index] })),
    ],
  })

  await $.session.start(START)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...HEADING('LAST RUNS · this repo'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'PR', 'success'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'PR', 'success'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'PR', 'success'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'stopped', 'permission'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'halted', 'error'),
    BLANK,
    ...TIMES('20s', '1m30s', ELASTIC('16 runs stored', DIM)),
    BLANK,
    ...NEXT_IDLE(NO_PLAN),
  ])
})

test('draws the measured stage times and their source while fewer than ten runs are stored', async ($, on) => {
  let plan = PLAN
  world(on, () => plan)
  stored(on, { runs: [seeded(0, 1, 1)] })
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: '' }))

  await $.session.start(START)
  plan = PLAN_COMPLETE()
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...HEADING('LAST RUNS · this repo'),
    ...RUN_ROW(LOCAL_DAY, '1 stage', '10m00s', 'PR', 'success'),
    BLANK,
    ...TIMES('1m36s', '5m24s', MEASURED(1)),
    BLANK,
    ...NEXT_IDLE('plan complete'),
  ])
})

test('leaves LAST RUNS out when the store holds nothing', async ($, on) => {
  world(on, PLAN_COMPLETE)
  stored(on)

  await $.session.start(START)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...TIMES('1m36s', '5m24s', MEASURED(0)),
    BLANK,
    ...NEXT_IDLE(NO_PLAN),
  ])
})

test('names /ship-plan under NEXT when the plan has unticked stages and no run is active', async ($, on) => {
  world(on, () => PLAN)
  stored(on)

  await $.session.start(START)
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props })).slice(-NEXT_RUN.length)).toEqual(NEXT_RUN)
})

test('matches the real gate, commit and sidecar write calls of a ship run', async ($, on) => {
  let plan = PLAN.replace('- [x] 2.', '- [ ] 2.')
  let sidecar = '{"kind":"gate","command":"sh test.sh"}\n'
  const clock = world(on, () => plan, undefined, () => sidecar)
  const atoms = held(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: e.description === 'Execute plan stage 2' ? 'two' : 'three' }, text: '' }
    }

    if (String(e.command).includes('test.sh')) {
      await clock.advance(4_000)

      return { result: '', text: 'EXIT=1', isError: true }
    }

    if (String(e.command).includes('plugin test')) {
      await clock.advance(2_000)

      return { result: '', text: 'ok' }
    }

    return String(e.command).includes('commit')
      ? { result: '', text: '[feat/bands 77b0d1f] widgets: second' }
      : { result: '', text: '' }
  })

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 2', subagent_type: 'plan-executor' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'two', reason: 'answer' })
  plan = PLAN
  await $.tool.call({ tool: 'Bash', command: 'git -C /src/widgets add -A && git -C /src/widgets commit -m "widgets: second"' })
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'three', reason: 'answer' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'R=/src/widgets; cd "$R" && sh test.sh; echo "EXIT=$?"' })
  await $.tool.call({ tool: 'Bash', command: 'sh /src/widgets/test.sh' })
  await $.tool.call({ tool: 'Bash', command: 'cd /src/widgets && sh test.sh' })
  sidecar += '{"kind":"gate","command":"claude plugin test mods/widgets"}\n'
  await $.tool.call({ tool: 'Bash', command: 'jq -nc . >> ~/.claude/plans/widgets-feat-bands.run.jsonl' })
  await $.tool.call({ tool: 'Bash', command: 'claude plugin test /abs/mods/widgets' })
  sidecar += '{"kind":"halt","stage":3,"reason":"sh test.sh exits 1","needs":"a fix for the failing test in greet"}\n'
  await $.tool.call({
    tool: 'Bash',
    command: 'SIDECAR=~/.claude/plans/widgets-feat-bands.run.jsonl; jq -nc --argjson stage 3 --arg reason "sh test.sh exits 1" \'{kind:"halt"}\' >> "$SIDECAR"',
  })
  const ui = await $.ui.mount(SIZED(26))

  const drawn = await ui.findAll({ type: 'Text' })

  expect(atoms.get('run')).toEqual([
    { kind: 'commit', stage: 2, sha: '77b0d1f', at: 0 },
    { kind: 'gate', stage: 3, command: 'R=/src/widgets; cd "$R" && sh test.sh; echo "EXIT=$?"', isError: true, durationMs: 4_000, at: 4_000 },
    { kind: 'gate', stage: 3, command: 'sh /src/widgets/test.sh', isError: true, durationMs: 4_000, at: 8_000 },
    { kind: 'gate', stage: 3, command: 'cd /src/widgets && sh test.sh', isError: true, durationMs: 4_000, at: 12_000 },
    { kind: 'gate', stage: 3, command: 'claude plugin test /abs/mods/widgets', isError: false, durationMs: 2_000, at: 14_000 },
  ])
  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(HALTED_CHIP),
    ...PREFLIGHT('claude plugin test mods/widgets'),
    ...STAGES_ROW.halted(LINE('halted at 3 of 4'), LINE('18s')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('NEEDS YOU', undefined, ENDED),
    ...ROW(ELASTIC('sh test.sh exits 1', { wrap: 'wrap', color: 'error' })),
    ...ROW(ELASTIC('a fix for the failing test in greet', { wrap: 'wrap' })),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First'),
      DONE('2 Second', { start: 0, time: '0s', sha: '77b0d1f', isButton: true }),
      HALTED('3 Third', { start: 0, time: '0s', isButton: true }),
      PENDING('4 Fourth', LAST),
    ),
  ])
})

test('keeps a ticked stage running until its commit during a ship run', async ($, on) => {
  let plan = PLAN
  world(on, () => plan)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) =>
    e.tool === 'Agent'
      ? { result: { status: 'async_launched', agentId: 'worker' }, text: '' }
      : { result: '', text: e.command === 'git commit -m third' ? '[feat/bands a41c9e2] third' : '' },
  )

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  const ui = await $.ui.mount(SIZED(40))
  const ticked = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  const committed = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  const drawn = (progress: object[], third: object[], fourth: object[]) => [
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...progress,
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), third, fourth),
  ]

  expect({ ticked, committed }).toEqual({
    ticked: drawn(
      STAGES_ROW.running(LINE('3 of 4'), LINE('0s'), LEFT('~10m left')),
      RUNNING('3 Third', { start: 0, time: '0s', isButton: true }),
      PENDING('4 Fourth', LAST),
    ),
    committed: drawn(
      STAGES_ROW.running(LINE('4 of 4'), LINE('0s'), LEFT('~5m left')),
      DONE('3 Third', { start: 0, time: '0s', sha: 'a41c9e2', isButton: true }),
      RUNNING('4 Fourth', { time: '0s', ...LAST }),
    ),
  })
})

test('settles a ticked stage once a later stage starts although its commit was never recorded', async ($, on) => {
  let ticked = 0
  const clock = world(on, () => PLAN.replaceAll('- [x]', '- [ ]').replace('- [ ] 1.', ticked > 0 ? '- [x] 1.' : '- [ ] 1.'))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => (e.tool === 'Agent' ? { result: { agentId: 'worker' }, text: '' } : { result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 1', subagent_type: 'plan-executor' })
  await clock.advance(10_000)
  ticked = 1
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 2', subagent_type: 'plan-executor' })
  await clock.advance(5_000)
  const pane = await $.ui.mount(SIZED(40))

  const drawn = await pane.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP('ship-plan · widgets'),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('2 of 4'), LINE('15s'), LEFT('~16m left')),
    ...PUSH_ROW(),
    ...PR_ROW(),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(
      DONE('1 First', { start: 0, time: '10s', isButton: true }),
      RUNNING('2 Second', { start: 10_000, time: '5s' }),
      PENDING('3 Third'),
      PENDING('4 Fourth', LAST),
    ),
    BLANK,
    ...HEADING('NOW · stage 2'),
    ...AGENT_ROW(ELASTIC('0 calls · 0 edits · 0 tests · 0 errors')),
  ])
})

test('walks the journey from not started to a PR open', async ($, on) => {
  const URL = 'https://github.com/me/widgets/pull/7'
  let sidecar = ''
  world(on, () => PLAN.replaceAll('- [x]', '- [ ]'), undefined, () => sidecar)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => ({ result: '', text: e.command === 'gh pr create' ? URL : '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  const ui = await $.ui.mount(PANE)
  const drawn = async () => (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  const notStarted = await drawn()

  sidecar = '{"kind":"gate","command":"npm test"}\n'
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const running = await drawn()

  sidecar += '{"kind":"halt","stage":1,"reason":"gate failed","needs":"a fix"}\n'
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const halted = await drawn()

  sidecar += '{"kind":"stage","n":1,"outcome":"diverged","note":"fixed"}\n'
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const again = await drawn()

  await $.tool.call({ tool: 'Bash', command: 'git push origin feat/bands' })
  const pushed = await drawn()

  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
  const opened = await drawn()

  const first = (rows: object[]) => [
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(rows, PENDING('2 Second'), PENDING('3 Third'), PENDING('4 Fourth', LAST)),
  ]

  expect({ notStarted, running, halted, again, pushed, opened }).toEqual({
    notStarted: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(),
      ...PREFLIGHT_OFF,
      ...STAGES_ROW.pending(LINE('0 of 4')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      ...first(RUNNING('1 First', { time: '0s' })),
    ],
    running: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.running(LINE('1 of 4'), LINE('0s'), LEFT('~21m left')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      ...first(RUNNING('1 First', { time: '0s' })),
    ],
    halted: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(HALTED_CHIP),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.halted(LINE('halted at 1 of 4'), LINE('0s')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      BLANK,
      ...HEADING('NEEDS YOU', undefined, ENDED),
      ...ROW(ELASTIC('gate failed', { wrap: 'wrap', color: 'error' })),
      ...ROW(ELASTIC('a fix', { wrap: 'wrap' })),
      ...first(HALTED('1 First', { time: '0s' })),
    ],
    again: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.running(LINE('1 of 4'), LINE('0s'), LEFT('~21m left')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      ...first([...RUNNING('1 First', { time: '0s' }), ...DETAIL('diverged: fixed')]),
    ],
    pushed: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.running(LINE('1 of 4'), LINE('0s'), LEFT('~21m left')),
      ...PUSH_ROW(true),
      ...PR_ROW(),
      ...first([...RUNNING('1 First', { time: '0s' }), ...DETAIL('diverged: fixed')]),
    ],
    opened: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(OPEN_CHIP),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.running(LINE('1 of 4'), LINE('0s')),
      ...PUSH_ROW(true),
      ...PR_ROW(URL),
      ...first([...RUNNING('1 First', { time: '0s' }), ...DETAIL('diverged: fixed')]),
      ...NEXT_RUN,
    ],
  })
})

const URL = 'https://github.com/me/widgets/pull/7'
const flight = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On, pane: object = PANE) => {
  let plan = PLAN
  let sidecar = '{"kind":"gate","command":"npm test"}\n'
  let gate = { ms: 5_000, isError: false }
  const clock = world(on, () => plan, undefined, () => sidecar)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { agentId: e.description === 'Execute plan stage 3' ? 'three' : 'four' }, text: '' }
    }

    if (e.command === 'npm test') {
      await clock.advance(gate.ms)

      return { result: '', text: '', isError: gate.isError }
    }

    return {
      result: '',
      text:
        e.command === 'git commit -m third'
          ? '[feat/bands aaa1111] third'
          : e.command === 'git commit -m fourth'
            ? '[feat/bands bbb2222] fourth'
            : e.command === 'gh pr create'
              ? URL
              : '',
    }
  })
  const spawn = (stage: number) =>
    $.tool.call({ tool: 'Agent', description: `Execute plan stage ${stage}`, subagent_type: 'plan-executor' })
  const finish = (agentId: string, turnId: string) =>
    $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId, agentId, reason: 'answer' })

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  const ui = await $.ui.mount(pane)

  return {
    drawn: async () => (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props })),
    running: async () => {
      await spawn(3)
      await clock.advance(20_000)
      await finish('three', 't3')
      plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
      await $.tool.call({ tool: 'Bash', command: 'npm test' })
      await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
      await spawn(4)
      await clock.advance(10_000)
      await $.tool.call({ tool: 'Read', file_path: '/src/a.ts', agentId: 'four' })
    },
    halted: async () => {
      await clock.advance(10_000)
      await finish('four', 't4')
      gate = { ms: 4_000, isError: true }
      await $.tool.call({ tool: 'Bash', command: 'npm test' })
      sidecar += '{"kind":"halt","stage":4,"reason":"gate failed","needs":"a fix"}\n'
      await $.tool.call({ tool: 'Bash', command: 'true' })
    },
    opened: async () => {
      sidecar += '{"kind":"stage","n":4,"outcome":"diverged","note":"kept 24-hour times"}\n'
      await clock.advance(6_000)
      plan = PLAN.replaceAll('- [ ]', '- [x]')
      gate = { ms: 3_000, isError: false }
      await $.tool.call({ tool: 'Bash', command: 'npm test' })
      await $.tool.call({ tool: 'Bash', command: 'git commit -m fourth' })
      await $.tool.call({ tool: 'Bash', command: 'git push origin feat/bands' })
      await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
    },
  }
}

const STAGES = [BLANK, ...HEADING('STAGES')]
const FIRST_TWO = [DONE('1 First'), DONE('2 Second')]
const THIRD = DONE('3 Third', { start: 0, time: '20s', sha: 'aaa1111', isButton: true })
const FOURTH_DONE = [
  ...DONE('4 Fourth', { start: 25_000, time: '20s', sha: 'bbb2222', isButton: true, ...LAST }),
  ...DETAIL('diverged: kept 24-hour times', {}, true),
]
const NEEDS_DIVERGED = [
  BLANK,
  ...HEADING('NEEDS YOU'),
  ...SIDECAR_ROW(LINE('1 stage diverged from the plan', { color: 'permission' }), SEPARATOR, ELASTIC('stage 4', DIM)),
]
const OPENED_TOP = [
  ...TOP('ship-plan · widgets'),
  ...JOURNEY(OPEN_CHIP),
  ...PREFLIGHT('npm test'),
  ...STAGES_ROW.done(LINE('4 of 4'), LINE('58s')),
  ...PUSH_ROW(true),
  ...PR_ROW(URL),
]
const OPENED_TOTALS = TOTALS('sub-agents 40s · gates 12s · main loop 6s')

test('draws the stages as a spine while a stage runs, at a halt and once the PR is open', async ($, on) => {
  const ship = await flight($, on, SIZED(40))

  await ship.running()
  const running = await ship.drawn()
  await ship.halted()
  const halted = await ship.drawn()
  await ship.opened()
  const opened = await ship.drawn()

  expect({ running, halted, opened }).toEqual({
    running: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.running(LINE('4 of 4'), LINE('35s'), LEFT('~5m left')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      ...STAGES,
      ...SPINE(...FIRST_TWO, THIRD, RUNNING('4 Fourth', { start: 25_000, time: '10s', ...LAST })),
      BLANK,
      ...HEADING('NOW · stage 4'),
      ...AGENT_ROW(ELASTIC('1 call · 0 edits · 0 tests · 0 errors')),
      ...AGENT_ROW(CALL('✓ Read', '/src/a.ts', 'success')),
    ],
    halted: [
      ...TOP('ship-plan · widgets'),
      ...JOURNEY(HALTED_CHIP),
      ...PREFLIGHT('npm test'),
      ...STAGES_ROW.halted(LINE('halted at 4 of 4'), LINE('49s')),
      ...PUSH_ROW(),
      ...PR_ROW(),
      BLANK,
      ...HEADING('NEEDS YOU', undefined, ENDED),
      ...ROW(ELASTIC('gate failed', { wrap: 'wrap', color: 'error' })),
      ...ROW(ELASTIC('a fix', { wrap: 'wrap' })),
      ...STAGES,
      ...SPINE(...FIRST_TWO, THIRD, [
        ...HALTED('4 Fourth', { start: 25_000, time: '20s', isButton: true, ...LAST }),
        ...DETAIL('gate failed', { color: 'error' }, true),
      ]),
    ],
    opened: [...OPENED_TOP, ...STAGES, ...SPINE(...FIRST_TWO, THIRD, FOURTH_DONE), ...OPENED_TOTALS, ...NEEDS_DIVERGED],
  })
})

test('drops the sha column and widens the title when a narrow pane would leave the title under twenty cells', async ($, on) => {
  const ship = await flight($, on, {
    ...PANE,
    viewport: { columns: 80, rows: 40 },
    props: { ...PANE.props, bodyColumns: 44, scroll: { offset: 0, bodyRows: 36 } },
  })
  const width = { width: 26 }

  await ship.running()
  await ship.halted()
  await ship.opened()

  expect(await ship.drawn()).toEqual([
    ...OPENED_TOP,
    ...STAGES,
    ...SPINE(
      DONE('1 First', width),
      DONE('2 Second', width),
      DONE('3 Third', { start: 0, time: '20s', isButton: true, ...width }),
      [
        ...DONE('4 Fourth', { start: 25_000, time: '20s', isButton: true, ...LAST, ...width }),
        ...DETAIL('diverged: kept 24-hour times', {}, true),
      ],
    ),
    ...OPENED_TOTALS,
    ...NEEDS_DIVERGED,
  ])
})

test('keeps the blank spine rows while the drawing fits the pane', async ($, on) => {
  const ship = await flight($, on, SIZED(25))

  await ship.running()
  await ship.halted()
  await ship.opened()

  expect(await ship.drawn()).toEqual([
    ...OPENED_TOP,
    ...STAGES,
    ...SPINE(...FIRST_TWO, THIRD, FOURTH_DONE),
    ...OPENED_TOTALS,
    ...NEEDS_DIVERGED,
  ])
})

test('removes every blank spine row together when the drawing is taller than the pane', async ($, on) => {
  const ship = await flight($, on, SIZED(24))

  await ship.running()
  await ship.halted()
  await ship.opened()

  expect(await ship.drawn()).toEqual([
    ...OPENED_TOP,
    ...STAGES,
    ...TIGHT(...FIRST_TWO, THIRD, FOURTH_DONE),
    ...OPENED_TOTALS,
    ...NEEDS_DIVERGED,
  ])
})

test('cuts the drawing once the blank spine rows are gone and it is still taller than the pane', async ($, on) => {
  const ship = await flight($, on, SIZED(20))

  await ship.running()
  await ship.halted()
  await ship.opened()

  expect(await ship.drawn()).toEqual([
    ...OPENED_TOP,
    ...STAGES,
    ...TIGHT(...FIRST_TWO, THIRD, FOURTH_DONE),
    ...OPENED_TOTALS,
    BLANK,
  ])
})

test('cuts a docked pane to its bodyRows, not the window\'s rows', async ($, on) => {
  const ship = await flight($, on, { ...SIZED(60), props: { ...PANE.props, scroll: { offset: 0, bodyRows: 16 } } })

  await ship.running()
  await ship.halted()
  await ship.opened()

  expect(await ship.drawn()).toEqual([
    ...OPENED_TOP,
    ...STAGES,
    ...TIGHT(...FIRST_TWO, THIRD, FOURTH_DONE),
    ...OPENED_TOTALS,
    BLANK,
  ])
})

test('draws none of the first plan\'s events once the session follows a second plan', async ($, on) => {
  world(on, () => PLAN, ELSEWHERE)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => ({ result: '', text: e.command === 'gh pr create' ? URL : '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
  await $.tool.call({
    tool: 'Read',
    file_path: '/home/me/.claude/plans/widgets-champion-champion.md',
  })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('2 of 3'), LINE('0s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 Alpha'), RUNNING('2 Beta', { time: '0s' }), PENDING('3 Gamma', LAST)),
    ...NEXT_RUN,
  ])
})

test('does not record a sidecar write as a gate although it carries the gate command', async ($, on) => {
  world(on, () => PLAN, undefined, () => '{"kind":"gate","command":"sh test.sh"}\n')
  const atoms = held(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({
    tool: 'Bash',
    command: 'jq -nc --arg command "sh test.sh" \'{kind:"gate",command:$command}\' >> ~/.claude/plans/widgets-feat-bands.run.jsonl',
  })

  expect(atoms.get('run')).toEqual([])
})

test('starts a ship run with none of the earlier run\'s events', async ($, on) => {
  const clock = world(on, () => PLAN)
  const atoms = held(on)
  stored(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: 'worker' }, text: '' }
    }

    return { result: '', text: e.command === 'gh pr create' ? 'https://github.com/me/widgets/pull/9' : e.command === 'git commit -m third' ? '[feat/bands a41c9e2] third' : '' }
  })

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Agent', description: 'Build the widget', subagent_type: 'plan-executor' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
  await clock.advance(5_000)
  await $.skill.prompt(SHIP)

  expect({ run: atoms.get('run'), stages: atoms.get('stages'), times: atoms.get('times') }).toEqual({
    run: [],
    stages: [],
    times: { 2: { start: 5_000, finish: null } },
  })
})

test('counts the running stage up every second without a tool call', async ($, on) => {
  const clock = world(on, () => PLAN)

  await $.session.start(START)
  const ui = await $.ui.mount(PANE)
  await clock.advance(3_000)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    ...TOP(),
    ...JOURNEY(),
    ...PREFLIGHT(),
    ...STAGES_ROW.running(LINE('3 of 4'), LINE('3s')),
    BLANK,
    ...HEADING('STAGES'),
    ...SPINE(DONE('1 First'), DONE('2 Second'), RUNNING('3 Third', { time: '3s' }), PENDING('4 Fourth', LAST)),
    ...NEXT_RUN,
  ])
})

test('ends an open ship run when the session follows a second plan', async ($, on) => {
  world(on, () => PLAN, ELSEWHERE)
  const kept = stored(on)
  const sent: unknown[] = []
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', (_, e) => {
    sent.push(e)

    return { value: { isSent: false, reason: 'no-channel' } }
  })
  on('tool.call', () => ({ result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({
    tool: 'Read',
    file_path: '/home/me/.claude/plans/widgets-champion-champion.md',
  })
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount(PANE)

  const drawn = await ui.findAll({ type: 'Text' })

  expect({ sent, runs: kept.get('runs'), drawn: drawn.map(({ text, props }) => ({ text, props })) }).toEqual({
    sent: [],
    runs: undefined,
    drawn: [
      ...TOP(),
      ...JOURNEY(),
      ...PREFLIGHT(),
      ...STAGES_ROW.running(LINE('2 of 3'), LINE('0s')),
      BLANK,
      ...HEADING('STAGES'),
      ...SPINE(DONE('1 Alpha'), RUNNING('2 Beta', { time: '0s' }), PENDING('3 Gamma', LAST)),
      ...NEXT_RUN,
    ],
  })
})

test('stores and notifies a stop after a gh pr call that returned no url', async ($, on) => {
  const clock = world(on, () => PLAN)
  const kept = stored(on)
  const sent: unknown[] = []
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.notify', (_, e) => {
    sent.push(e)

    return { value: { isSent: false, reason: 'no-channel' } }
  })
  on('tool.call', () => ({ result: '', text: '' }))

  await $.session.start(START)
  await $.skill.prompt(SHIP)
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })
  await clock.advance(10_000)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect({ sent, runs: kept.get('runs') }).toEqual({
    sent: [{ text: 'ship-plan stopped at stage 3, no reason recorded', title: 'ship-plan' }],
    runs: [
      {
        repo: 'widgets',
        plan: 'widgets-feat-bands.md',
        startedAt: 0,
        endedAt: 10_000,
        outcome: 'stopped',
        totalMs: 10_000,
        stages: [],
      },
    ],
  })
})

test('cancels the redraw timer five ticks after the pane last drew a running stage', async ($, on) => {
  let plan = PLAN
  let redraws = 0
  const clock = world(on, () => plan)
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: '', text: '' }))
  on('ui.invalidate', (_, e, next) => {
    redraws += 1

    return next(e)
  })

  await $.session.start(START)
  await $.ui.mount(PANE)
  await clock.advance(3_000)
  plan = PLAN.replaceAll('- [ ]', '- [x]')
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await clock.advance(20_000)

  expect(redraws).toEqual(8)
})

const SVG_STYLE =
  ':root{--line:#e3dcd3;--fg:#2a2521;--muted:#786e65;--accent:#b35a00;--green:#3d7a3a;--red:#b03434}@media (prefers-color-scheme:dark){:root{--line:#332e29;--fg:#ebe4db;--muted:#9c9187;--accent:#ff8f40;--green:#9ccc7a;--red:#f07178}}.rail{stroke:var(--line);stroke-width:2}.fill{stroke:var(--green);stroke-width:2}.done{fill:var(--green)}.halted{fill:var(--red)}.ring{fill:none;stroke:var(--accent);stroke-width:2}.dot{fill:var(--accent)}.pending{fill:none;stroke:var(--muted);stroke-width:1.5}text{font:17px system-ui,sans-serif;fill:var(--fg)}.sub{font-size:13px}.mid{text-anchor:middle}.dim{fill:var(--muted)}'
const SVG = (height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 ${height}"><style>${SVG_STYLE}</style>${body}</svg>`
const STEPPER = (...steps: { node: string; name: string; sub: string; isPending?: boolean; link?: string }[]) =>
  SVG(
    66,
    steps
      .map(({ node, name, sub, isPending, link = '' }, at) => {
        const x = 65 + 130 * at

        return `${link}${node.replaceAll('X', String(x))}<text class="mid${isPending ? ' dim' : ''}" x="${x}" y="40">${name}</text><text class="mid sub dim" x="${x}" y="58">${sub}</text>`
      })
      .join(''),
  )
const NODE = {
  done: '<circle class="done" cx="X" cy="10" r="5"/>',
  halted: '<circle class="halted" cx="X" cy="10" r="5"/>',
  running: '<circle class="ring" cx="X" cy="10" r="6"/><circle class="dot" cx="X" cy="10" r="2.5"/>',
  pending: '<circle class="pending" cx="X" cy="10" r="5"/>',
}
const LINK = (at: number, tone: string) => `<line class="${tone}" x1="${65 + 130 * (at - 1) + 8}" y1="10" x2="${65 + 130 * at - 8}" y2="10"/>`
const D_TEXT = (children: string, props: object = {}) => ({ type: 'Text', ...(Object.keys(props).length > 0 ? { props } : {}), children: [children] })
const D_BOX = (props: object, ...children: object[]) => ({ type: 'Box', ...(Object.keys(props).length > 0 ? { props } : {}), ...(children.length > 0 ? { children } : {}) })
const D_CAPTION = (label: string) => D_TEXT(label, { dimColor: true, bold: true, weight: 'semibold' })
const D_SVG = (source: string, alt: string) => ({ type: 'Svg', props: { source, alt } })
const D_DOT = {
  done: { text: '●', color: 'success' },
  running: { text: '●', color: 'permission', bold: true, weight: 'semibold' },
  halted: { text: '■', color: 'error' },
  pending: { text: '○', dimColor: true },
}
const D_COLUMN = (width: number, text: string, props: object = {}) => D_BOX({ width, flexShrink: 0, justifyContent: 'flex-end' }, D_TEXT(text, props))
const D_ROW = (
  number: number,
  state: keyof typeof D_DOT,
  title: string,
  { start = '', time = '', heat, sha = '', mark, press }: { start?: string; time?: string; heat?: string; sha?: string; mark?: { text: string; tone: string }; press?: { hotkey?: string } } = {},
) => {
  const { text, ...dot } = D_DOT[state]
  const tone = state === 'running' ? { bold: true, weight: 'semibold' } : state === 'pending' ? { dimColor: true } : {}
  const label = D_TEXT(title, { wrap: 'truncate-end', ...tone })

  return D_BOX(
    { gap: 1 },
    D_TEXT(text, dot),
    D_TEXT(String(number).padStart(2), DIM),
    D_BOX(
      { flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', gap: 1 },
      press ? { type: 'Button', props: { key: `stage-${number}`, label: title, ...(press.hotkey ? { hotkey: press.hotkey } : {}), plain: true }, children: [label], press: D_HANDLE } : label,
      ...(mark ? [D_BOX({ flexShrink: 0 }, D_TEXT(mark.text, { color: mark.tone }))] : []),
    ),
    D_COLUMN(5, start, DIM),
    D_COLUMN(7, time, heat ? { color: heat } : {}),
    D_COLUMN(7, sha, { color: 'permission' }),
  )
}
const D_DIVERGED = { text: 'diverged', tone: 'warning' }
const D_LEGEND = D_BOX(
  { gap: 2 },
  D_TEXT('● under p50 (1m36s)', { color: 'success' }),
  D_TEXT('● to p90 (5m24s)', { color: 'warning' }),
  D_TEXT('● over p90', { color: 'error' }),
)
const D_TAGLINE = D_BOX({ justifyContent: 'space-between' }, D_TEXT('ship-plan · widgets', DIM))
const D_PANE = (...sections: object[]) => ({
  ...D_BOX({ flexDirection: 'column', gap: 2, padding: 2 }, D_TAGLINE, ...sections),
  part: { plugin: 'checkpoint-plan' },
})
const D_SECTION = (...children: object[]) => D_BOX({ flexDirection: 'column', gap: 1 }, ...children)
const D_HANDLE = { plugin: 'checkpoint-plan', handle: 0 }
const D_STRIPPED = (tree: unknown) => JSON.parse(JSON.stringify(tree), (key, value) => (key === 'press' ? D_HANDLE : value))

test('draws a ship run on Desktop as one SVG stepper, one row per stage and a heat legend', async ($, on) => {
  await shipRun($, on, () => SIDECAR)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.drawn()).toEqual(
    D_PANE(
      D_SECTION(
        D_BOX({ justifyContent: 'space-between' }, D_CAPTION('JOURNEY')),
        D_SVG(
          STEPPER(
            { node: NODE.done, name: 'preflight', sub: 'npm test' },
            { node: NODE.running, name: 'stages', sub: '3 of 4', link: LINK(1, 'fill') },
            { node: NODE.pending, name: 'push', sub: '', isPending: true, link: LINK(2, 'rail') },
            { node: NODE.pending, name: 'PR', sub: '', isPending: true, link: LINK(3, 'rail') },
          ),
          '✓ preflight npm test, ● stages 3 of 4, ○ push, ○ PR',
        ),
      ),
      D_SECTION(
        D_BOX({ justifyContent: 'space-between' }, D_CAPTION('STAGES'), D_TEXT('0s · ~10m left', DIM)),
        D_BOX(
          { flexDirection: 'column' },
          D_ROW(1, 'done', 'First'),
          D_ROW(2, 'done', 'Second', { mark: D_DIVERGED }),
          D_ROW(3, 'running', 'Third', { time: '0s', heat: 'success' }),
          D_ROW(4, 'pending', 'Fourth'),
        ),
        D_LEGEND,
      ),
    ),
  )
  await ui.unmount()
})

test('escapes a gate command in the Desktop journey so its SVG stays well formed', async ($, on) => {
  await shipRun($, on, () => SIDECAR.replace('"command":"npm test"', '"command":"npm test && tsc <src>"'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const journey = await ui.find({ type: 'Svg' })

  expect(journey?.props.source.match(/>npm test[^<]*</)?.[0]).toEqual('>npm test &amp;&amp; tsc &lt;src&gt;<')
})

test('cuts a long gate command in the Desktop journey and keeps it whole in the alt text', async ($, on) => {
  await shipRun($, on, () => SIDECAR.replace('"command":"npm test"', '"command":"mvn test -pl agent-backend -am"'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const journey = await ui.find({ type: 'Svg' })

  expect({ label: journey?.props.source.match(/>mvn[^<]*</)?.[0], alt: journey?.props.alt.split(', ')[0] }).toEqual({
    label: '>mvn test -pl agent-ba…<',
    alt: '✓ preflight mvn test -pl agent-backend -am',
  })
})

test('draws a halt on Desktop as the HALTED chip beside the journey heading and a red stage dot', async ($, on) => {
  await shipRun($, on, () => `${SIDECAR}\n{"kind":"halt","stage":3,"reason":"gate failed","needs":"2 tests in StainTests"}\n`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = (await ui.drawn()) as { children: object[] }
  await ui.unmount()

  expect([tree.children[1], tree.children[3]]).toEqual([
    D_SECTION(
      D_BOX(
        { justifyContent: 'space-between' },
        D_CAPTION('JOURNEY'),
        D_TEXT(' HALTED ', { color: 'error', backgroundColor: 'diffRemovedDimmed' }),
      ),
      D_SVG(
        STEPPER(
          { node: NODE.done, name: 'preflight', sub: 'npm test' },
          { node: NODE.halted, name: 'stages', sub: 'halted at 3 of 4', link: LINK(1, 'fill') },
          { node: NODE.pending, name: 'push', sub: '', isPending: true, link: LINK(2, 'rail') },
          { node: NODE.pending, name: 'PR', sub: '', isPending: true, link: LINK(3, 'rail') },
        ),
        '✓ preflight npm test, ■ stages halted at 3 of 4, ○ push, ○ PR',
      ),
    ),
    D_SECTION(
      D_BOX({ justifyContent: 'space-between' }, D_CAPTION('STAGES'), D_TEXT('0s', DIM)),
      D_BOX(
        { flexDirection: 'column' },
        D_ROW(1, 'done', 'First'),
        D_ROW(2, 'done', 'Second', { mark: D_DIVERGED }),
        D_ROW(3, 'halted', 'Third', { time: '0s', heat: 'success' }),
        D_ROW(4, 'pending', 'Fourth'),
      ),
      D_LEGEND,
    ),
  ])
})

test('opens a stage on Desktop under its row, with a note box, counts, files and calls', async ($, on) => {
  let plan = PLAN
  const clock = world(on, () => plan, undefined, () => '{"kind":"stage","n":3,"outcome":"as-planned","note":"tidy"}\n')
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      return { result: { status: 'async_launched', agentId: 'worker' }, text: '' }
    }

    return e.command === 'git commit -m third'
      ? { result: '', text: '[feat/bands a41c9e2] third' }
      : { result: '', text: '' }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', agentId: 'worker' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'worker' })
  await clock.advance(30_000)
  await $.turn.complete({ answer: 'done', durationMs: 30_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const stages = async () => D_STRIPPED(((await ui.drawn()) as { children: object[] }).children[2])
  const drawn = (isOpen: boolean) =>
    D_SECTION(
      D_BOX({ justifyContent: 'space-between' }, D_CAPTION('STAGES'), D_TEXT('30s', DIM)),
      D_BOX(
        { flexDirection: 'column' },
        D_ROW(1, 'done', 'First'),
        D_ROW(2, 'done', 'Second'),
        D_ROW(3, 'done', 'Third', { start: hhmm(0), time: '30s', heat: 'success', sha: 'a41c9e2', press: { hotkey: '3' } }),
        ...(isOpen
          ? [
              D_BOX(
                { flexDirection: 'column', marginLeft: 5 },
                D_BOX({ borderStyle: 'round', borderDimColor: true }, D_TEXT('as-planned: tidy', { wrap: 'wrap' })),
                D_BOX({ gap: 1 }, D_TEXT('2 calls · 1 edit · 0 tests · 0 errors', { wrap: 'truncate-end' })),
                D_BOX({ gap: 1 }, D_TEXT('/src/a.ts', { wrap: 'truncate-start' })),
                D_BOX({ gap: 1 }, D_BOX({ key: '0', flexShrink: 0 }, D_TEXT('✓ Edit', { color: 'success' })), D_TEXT('  /src/a.ts', { wrap: 'truncate-end' })),
                D_BOX({ gap: 1 }, D_BOX({ key: '0', flexShrink: 0 }, D_TEXT('✓ Bash', { color: 'success' })), D_TEXT('  ls', { wrap: 'truncate-end' })),
              ),
            ]
          : []),
        D_ROW(4, 'running', 'Fourth', { time: '0s', heat: 'success' }),
      ),
      D_LEGEND,
    )
  const before = await stages()
  await ui.press({ key: 'stage-3' })
  const opened = await stages()
  await ui.press({ key: 'stage-3' })
  const after = await stages()
  await ui.unmount()

  expect({ before, opened, after }).toEqual({ before: drawn(false), opened: drawn(true), after: drawn(false) })
})

test('draws a diverged note in an amber border in the Desktop drill-down and cuts each call to its first line', async ($, on) => {
  let plan = PLAN
  world(on, () => plan, undefined, () => '{"kind":"stage","n":3,"outcome":"diverged","note":"kept the old key"}\n')
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async (_, e) =>
    e.tool === 'Agent' ? { result: { status: 'async_launched', agentId: 'worker' }, text: '' } : { result: '', text: '[feat/bands a41c9e2] third' },
  )

  await $.session.start(START)
  await $.tool.call({ tool: 'Agent', description: 'Execute plan stage 3', subagent_type: 'plan-executor' })
  await $.tool.call({ tool: 'Bash', command: "cat > shop.sh <<'EOF'\n#!/bin/sh\necho hi\nEOF", agentId: 'worker' })
  await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: 't1', agentId: 'worker', reason: 'answer' })
  plan = PLAN.replace('- [ ] 3.', '- [x] 3.')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m third' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'stage-3' })
  const stages = D_STRIPPED(((await ui.drawn()) as { children: object[] }).children[2]) as { children: object[] }
  await ui.unmount()

  expect(stages.children[1]).toEqual(
    D_BOX(
      { flexDirection: 'column' },
      D_ROW(1, 'done', 'First'),
      D_ROW(2, 'done', 'Second'),
      D_ROW(3, 'done', 'Third', { start: hhmm(0), time: '0s', heat: 'success', sha: 'a41c9e2', mark: D_DIVERGED, press: { hotkey: '3' } }),
      D_BOX(
        { flexDirection: 'column', marginLeft: 5 },
        D_BOX({ borderStyle: 'round', borderColor: 'warning' }, D_TEXT('diverged: kept the old key', { wrap: 'wrap' })),
        D_BOX({ gap: 1 }, D_TEXT('1 call · 0 edits · 0 tests · 0 errors', { wrap: 'truncate-end' })),
        D_BOX({ gap: 1 }, D_BOX({ key: '0', flexShrink: 0 }, D_TEXT('✓ Bash', { color: 'success' })), D_TEXT("  cat > shop.sh <<'EOF'", { wrap: 'truncate-end' })),
      ),
      D_ROW(4, 'running', 'Fourth', { time: '0s', heat: 'success' }),
    ),
  )
})
