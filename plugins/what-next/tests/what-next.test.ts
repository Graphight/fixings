import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { ask, parse, question, summary } from '../hooks/register'

const NUMBERED = `# Open proposals

In build order.

1. [Champion skills](champion-skills.md): does deciding the unlock order give a build its shape? Split from champion levels.
2. [Minimap](minimap.md): on a large map, can a player find their fires at 0.5× zoom?

Frozen water and the art pass come after these.
`
const TICKED = `# Proposals

- One file per idea: \`slug.md\`, no number.

## Open

- \`wall-junctions\`: four players describe junctions they could not build.
The proposal says so in the guide.

## Parked

Thought through and deliberately not planned.

- \`auto-corners\`: walls picking their own corner piece from neighbours.
Revive only if hand-placed corners turn out to be the main complaint.
`
const TEN = Array.from({ length: 10 }, (_, at) => `${at + 1}. [Idea ${at + 1}](idea-${at + 1}.md): why idea ${at + 1}? Because.`).join('\n')
const FILES = { 'docs/proposals/README.md': NUMBERED, 'docs/proposals/minimap.md': '# Minimap\n\nBody.' }
const PANE = {
  plugin: 'what-next',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'what-next',
  viewport: { columns: 80, rows: 24 },
  props: {
    title: 'What next',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const ISSUES = [
  { number: 9, title: 'Fires spread too fast', body: '\nWildfire crosses a road in one tick.\nSecond line.' },
  { number: 10, title: 'Minimap blank', body: '' },
]
const BOTH_ABSENT = 'No docs/proposals/README.md, and gh issue list gave no issues.'
const START = { cwd: '/src/game', surface: 'terminal', isInteractive: true } as const

type Host = { remote?: string | null; gh?: { exitCode: number; stdout: string } | 'throws'; assigned?: unknown[]; ran?: unknown[] }
const GH_FAILS = { exitCode: 1, stdout: '' }
const gh = (issues: unknown): Host => ({ gh: { exitCode: 0, stdout: JSON.stringify(issues) } })

// A project's files, and a record of what the mod asked the engine to do.
const world = (on: On, files: Record<string, string>, paths: string[] = [], { remote = null, gh: out = GH_FAILS, assigned, ran = [] }: Host = {}) => {
  const asked: string[] = []
  const found = (path: string) => Object.keys(files).find(name => path.endsWith(name))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/src/game' }))
  on('fs.exists', ($, e) => {
    paths.push(e.path)

    return { value: found(e.path) !== undefined }
  })
  on('fs.read', ($, e) => {
    paths.push(e.path)
    const name = found(e.path)

    return name === undefined ? { deny: `unexpected read of ${e.path}` } : { value: files[name] ?? '' }
  })
  on('session.repo', () => ({ value: remote === null ? null : { root: '/src/game', remote, internal: false, name: null } }))
  on('process.run', (_, e) => {
    ran.push([e.argv, e.init])

    if (out === 'throws') {
      throw new Error('gh is unavailable')
    }

    const result = e.argv.includes('--assignee') ? (assigned === undefined ? GH_FAILS : { exitCode: 0, stdout: JSON.stringify(assigned) }) : out

    return { value: { ...result, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => {
    asked.push(`register /${e.name}`)

    return { value: { command: e.name } }
  })
  on('ui.open', ($, e) => {
    asked.push(`open ${e.id}`)

    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    asked.push(`close ${e.id}`)

    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    asked.push(`fill ${e.text}`)

    return { isFilled: true }
  })

  return asked
}

// The pane as `/next` opens it over those files.
const opened = async ($: Engine, on: On, files: Record<string, string>, paths: string[] = [], host: Host = {}) => {
  const asked = world(on, files, paths, host)
  await $.command.run({ command: 'next', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } })
  const ui = await $.ui.mount(PANE)
  const markdown = async () => (await ui.findAll({ type: 'Markdown' })).map(({ props }) => props.text)

  return { ui, asked, markdown }
}

test('reads a numbered README, titles as names', () => {
  expect(parse(NUMBERED)).toEqual([
    {
      slug: 'champion-skills',
      name: 'Champion skills',
      note: 'does deciding the unlock order give a build its shape? Split from champion levels.',
      isParked: false,
    },
    {
      slug: 'minimap',
      name: 'Minimap',
      note: 'on a large map, can a player find their fires at 0.5× zoom?',
      isParked: false,
    },
  ])
})

test('reads a backticked README, slugs as names, later lines and the Parked heading kept', () => {
  expect(parse(TICKED)).toEqual([
    {
      slug: 'wall-junctions',
      name: 'wall-junctions',
      note: 'four players describe junctions they could not build.\nThe proposal says so in the guide.',
      isParked: false,
    },
    {
      slug: 'auto-corners',
      name: 'auto-corners',
      note: 'walls picking their own corner piece from neighbours.\nRevive only if hand-placed corners turn out to be the main complaint.',
      isParked: true,
    },
  ])
})

test('the question is the first sentence, a decimal point not ending it', () => {
  expect(parse(NUMBERED).map(({ note }) => question(note))).toEqual([
    'does deciding the unlock order give a build its shape?',
    'on a large map, can a player find their fires at 0.5× zoom?',
  ])
})

test('registers no command in a project with no proposals', async ($, on) => {
  const asked = world(on, {})

  await $.session.start(START)

  expect(asked).toEqual([])
})

test('registers the command where a README lists proposals', async ($, on) => {
  const asked = world(on, { 'docs/proposals/README.md': NUMBERED })

  await $.session.start(START)

  expect(asked).toEqual(['register /next'])
})

test('pads the numbers to the width of the last row', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': TEN })

  const numbers = (await ui.findAll({ type: 'Text' })).filter(({ props }) => props.color === '#ff8f40').map(({ text }) => text)

  expect(numbers).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
})

test('draws number, name and question, then a Parked heading over the parked rows', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': TICKED })

  const texts = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, color: props.color, dim: props.dimColor, weight: props.weight }))
  const names = (await ui.findAll({ type: 'Button' })).map(({ key, text, props }) => ({ key, text, dim: props.dimColor }))

  expect({ texts, names }).toEqual({
    texts: [
      { text: '1 proposal · 1 parked · next: wall-junctions', color: '#8a949c', dim: undefined, weight: undefined },
      { text: ' ', color: undefined, dim: undefined, weight: undefined },
      { text: '1', color: '#ff8f40', dim: false, weight: undefined },
      { text: 'four players describe junctions they could not build.', color: '#8a949c', dim: false, weight: undefined },
      { text: ' ', color: undefined, dim: undefined, weight: undefined },
      { text: 'Parked', color: undefined, dim: undefined, weight: 'semibold' },
      { text: '2', color: '#ff8f40', dim: true, weight: undefined },
      { text: 'walls picking their own corner piece from neighbours.', color: '#8a949c', dim: true, weight: undefined },
    ],
    names: [
      { key: 'ask', text: 'Ask which is next', dim: undefined },
      { key: 'wall-junctions', text: 'wall-junctions', dim: false },
      { key: 'auto-corners', text: 'auto-corners', dim: true },
    ],
  })
})

test('each row button is keyed by slug and shows the name', async ($, on) => {
  const { ui } = await opened($, on, FILES)

  const rows = (await ui.findAll({ type: 'Button' })).map(({ key, text, props }) => ({ key, text, dim: props.dimColor }))

  expect(rows).toEqual([
    ASK,
    { key: 'champion-skills', text: 'Champion skills', dim: false },
    { key: 'minimap', text: 'Minimap', dim: false },
  ])
})

test('a README with no entries draws one line and no Go to field', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': '# Proposals\n\nNone yet.\n' })

  const drawn = (await ui.findAll({})).map(({ type, text }) => ({ type, text }))

  expect(drawn).toEqual([{ type: 'Text', text: 'No proposals listed in docs/proposals/README.md.' }])
})

test('a surface with no Input draws the rows and no Go to field', async ($, on) => {
  world(on, FILES)
  await $.command.run({ command: 'next', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })

  const drawn = (await ui.findAll({ type: 'Button' })).map(({ key }) => key)

  expect(drawn).toEqual(['ask', 'champion-skills', 'minimap'])
  expect(await ui.findAll({ type: 'Input' })).toEqual([])
})

test('the number and the name keep their width when a row is too long for the pane', async ($, on) => {
  const { ui } = await opened($, on, FILES)

  const unshrinking = (await ui.findAll({ type: 'Box' })).map(({ props }) => props).filter(props => props.flexShrink === 0)

  expect(unshrinking).toEqual([{ flexShrink: 0 }, { minWidth: 23, flexShrink: 0 }, { flexShrink: 0 }, { minWidth: 23, flexShrink: 0 }])
})

test('the Go to field holds a part-typed number and is empty again after a row opens', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': TEN, 'docs/proposals/idea-10.md': 'Ten.' })
  const held = async () => (await ui.findAll({ type: 'Input' })).map(({ props }) => props.value)

  await ui.input({ key: 'goto', text: '1', kind: 'change' })
  const partTyped = await held()
  await ui.input({ key: 'goto', text: '10', kind: 'change' })
  await ui.press({ key: 'back' })

  expect({ partTyped, afterBack: await held() }).toEqual({ partTyped: ['1'], afterBack: [''] })
})

test('pressing a row reads its file', async ($, on) => {
  const { ui, markdown } = await opened($, on, FILES)

  await ui.press({ key: 'minimap' })

  expect(await markdown()).toEqual(['# Minimap\n\nBody.'])
})

test('a full-width number opens its row as it is typed', async ($, on) => {
  const { ui, markdown } = await opened($, on, FILES)

  await ui.input({ key: 'goto', text: '2', kind: 'change' })

  expect(await markdown()).toEqual(['# Minimap\n\nBody.'])
})

test('a shorter number opens its row on submit only', async ($, on) => {
  const { ui, markdown } = await opened($, on, { 'docs/proposals/README.md': TEN, 'docs/proposals/idea-3.md': 'Three.' })

  await ui.input({ key: 'goto', text: '3', kind: 'change' })
  expect(await markdown()).toEqual([])

  await ui.input({ key: 'goto', text: '3' })
  expect(await markdown()).toEqual(['Three.'])
})

test('a number out of range or not a number does nothing', async ($, on) => {
  const { ui, markdown } = await opened($, on, FILES)

  await ui.input({ key: 'goto', text: '9' })
  await ui.input({ key: 'goto', text: 'x' })
  await ui.input({ key: 'goto', text: '1e0' })

  expect(await markdown()).toEqual([])
})

test('Back returns to the list', async ($, on) => {
  const { ui, markdown } = await opened($, on, FILES)

  await ui.press({ key: 'minimap' })
  await ui.press({ key: 'back' })

  expect(await markdown()).toEqual([])
})

test('an entry with no file shows its README note', async ($, on) => {
  const { ui, markdown } = await opened($, on, { 'docs/proposals/README.md': TICKED })

  await ui.press({ key: 'auto-corners' })

  expect(await markdown()).toEqual([
    '# auto-corners\n\nNo `docs/proposals/auto-corners.md`; the entry in the README is all there is.\n\nwalls picking their own corner piece from neighbours.\nRevive only if hand-placed corners turn out to be the main complaint.',
  ])
})

test('reads the README and the proposal under the session root', async ($, on) => {
  const paths: string[] = []
  const { ui } = await opened($, on, FILES, paths)

  await ui.press({ key: 'minimap' })

  expect(paths).toEqual([
    '/src/game/docs/proposals/README.md',
    '/src/game/docs/proposals/README.md',
    '/src/game/docs/proposals/minimap.md',
    '/src/game/docs/proposals/minimap.md',
  ])
})

test('Start fills the prompt with the proposal and closes the pane', async ($, on) => {
  const { ui, asked } = await opened($, on, FILES)

  await ui.press({ key: 'minimap' })
  await ui.press({ key: 'start' })

  expect(asked).toEqual(['open what-next', 'fill This session we are doing the "Minimap" proposal, please /checkpoint-plan', 'close what-next'])
})

test('registers the command with a remote and no README', async ($, on) => {
  const asked = world(on, {}, [], { remote: 'git@github.com:me/game.git' })

  await $.session.start(START)

  expect(asked).toEqual(['register /next'])
})

test('registers no command with neither a README nor a remote', async ($, on) => {
  const asked = world(on, {}, [], { remote: null })

  await $.session.start(START)

  expect(asked).toEqual([])
})

test('lists open issues through gh with a ten second timeout', async ($, on) => {
  const ran: unknown[] = []
  await opened($, on, FILES, [], { ...gh(ISSUES), ran })

  expect(ran).toEqual([
    [['gh', 'issue', 'list', '--json', 'number,title,body', '--limit', '100'], { timeoutMs: 10000 }],
    [['gh', 'issue', 'list', '--assignee', '@me', '--json', 'number', '--limit', '100'], { timeoutMs: 10000 }],
  ])
})

test('issues with no proposals draw their numbers, titles and first lines', async ($, on) => {
  const { ui } = await opened($, on, {}, [], gh(ISSUES))

  const texts = (await ui.findAll({ type: 'Text' })).map(({ text }) => text)
  const names = (await ui.findAll({ type: 'Button' })).map(({ key, text }) => ({ key, text }))
  const field = (await ui.findAll({ type: 'Input' })).map(({ props }) => props.placeholder)

  expect({ texts, names, field }).toEqual({
    texts: ['2 issues', ' ', '09', 'Wildfire crosses a road in one tick.', '10', ''],
    names: [
      { key: 'ask', text: 'Ask which is next' },
      { key: 'issue-9', text: 'Fires spread too fast' },
      { key: 'issue-10', text: 'Minimap blank' },
    ],
    field: ['#'],
  })
})

test('gh exiting non-zero with no proposals draws the line naming both sources', async ($, on) => {
  const { ui } = await opened($, on, {}, [], { gh: { exitCode: 1, stdout: 'not logged in' } })

  expect((await ui.findAll({})).map(({ type, text }) => ({ type, text }))).toEqual([{ type: 'Text', text: BOTH_ABSENT }])
})

test('gh throwing with no proposals draws the line naming both sources', async ($, on) => {
  const { ui } = await opened($, on, {}, [], { gh: 'throws' })

  expect((await ui.findAll({})).map(({ type, text }) => ({ type, text }))).toEqual([{ type: 'Text', text: BOTH_ABSENT }])
})

test('gh output that is not a JSON array leaves issues absent', async ($, on) => {
  const { ui } = await opened($, on, {}, [], { gh: { exitCode: 0, stdout: '{"number":1}' } })

  expect((await ui.findAll({})).map(({ type, text }) => ({ type, text }))).toEqual([{ type: 'Text', text: BOTH_ABSENT }])
})

test('zero open issues draw one line', async ($, on) => {
  const { ui } = await opened($, on, {}, [], gh([]))

  expect((await ui.findAll({})).map(({ type, text }) => ({ type, text }))).toEqual([{ type: 'Text', text: 'No open issues.' }])
})

const buttons = async (ui: Awaited<ReturnType<typeof opened>>['ui']) =>
  (await ui.findAll({ type: 'Button' })).map(({ key, text, props }) => ({ key, text, dim: props.dimColor }))
const STRIP = (isIssues: boolean) => [
  { key: 'tab-proposals', text: 'Proposals p', dim: isIssues },
  { key: 'tab-issues', text: 'Issues i', dim: !isIssues },
]
const ASK = { key: 'ask', text: 'Ask which is next', dim: undefined }
const heldText = async (ui: Awaited<ReturnType<typeof opened>>['ui']) => (await ui.findAll({ type: 'Input' })).map(({ props }) => props.value)

test('both sources draw the strip with Proposals current, then the proposal rows', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  expect(await buttons(ui)).toEqual([
    ...STRIP(false),
    ASK,
    { key: 'champion-skills', text: 'Champion skills', dim: false },
    { key: 'minimap', text: 'Minimap', dim: false },
  ])
})

test('pressing the Issues tab draws the issue rows with Issues current and the # placeholder', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'tab-issues' })

  expect({ buttons: await buttons(ui), field: (await ui.findAll({ type: 'Input' })).map(({ props }) => props.placeholder) }).toEqual({
    buttons: [...STRIP(true), ASK, { key: 'issue-9', text: 'Fires spread too fast', dim: false }, { key: 'issue-10', text: 'Minimap blank', dim: false }],
    field: ['#'],
  })
})

test('the current tab is the primary Button and the other the secondary', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))
  const variants = async () => (await ui.findAll({ type: 'Button' })).map(({ key, props }) => ({ key, variant: props.variant, plain: props.plain }))

  const atFirst = (await variants()).slice(0, 3)
  await ui.press({ key: 'tab-issues' })

  expect({ atFirst, onIssues: (await variants()).slice(0, 3) }).toEqual({
    atFirst: [
      { key: 'tab-proposals', variant: 'primary', plain: undefined },
      { key: 'tab-issues', variant: 'secondary', plain: undefined },
      { key: 'ask', variant: undefined, plain: true },
    ],
    onIssues: [
      { key: 'tab-proposals', variant: 'secondary', plain: undefined },
      { key: 'tab-issues', variant: 'primary', plain: undefined },
      { key: 'ask', variant: undefined, plain: true },
    ],
  })
})

test('pressing the Proposals tab goes back to the proposal rows', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'tab-issues' })
  await ui.press({ key: 'tab-proposals' })

  expect((await buttons(ui)).map(({ key }) => key)).toEqual(['tab-proposals', 'tab-issues', 'ask', 'champion-skills', 'minimap'])
})

test('only proposals draw no strip', async ($, on) => {
  const { ui } = await opened($, on, FILES)

  expect((await buttons(ui)).map(({ key }) => key)).toEqual(['ask', 'champion-skills', 'minimap'])
})

test('only issues draw no strip', async ($, on) => {
  const { ui } = await opened($, on, {}, [], gh(ISSUES))

  expect((await buttons(ui)).map(({ key }) => key)).toEqual(['ask', 'issue-9', 'issue-10'])
})

test('both sources with zero issues draw the strip and the empty line after switching', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh([]))

  await ui.press({ key: 'tab-issues' })

  expect({ buttons: await buttons(ui), texts: (await ui.findAll({ type: 'Text' })).map(({ text }) => text) }).toEqual({
    buttons: [...STRIP(true), ASK],
    texts: ['2 proposals · 0 issues · next: Champion skills', 'p', 'i', ' ', 'No open issues.'],
  })
})

test('typing i in Go to with the strip switches to issues and empties the field', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.input({ key: 'goto', text: 'i', kind: 'change' })

  expect({ keys: (await buttons(ui)).map(({ key }) => key), held: await heldText(ui) }).toEqual({
    keys: ['tab-proposals', 'tab-issues', 'ask', 'issue-9', 'issue-10'],
    held: [''],
  })
})

test('typing i in Go to without a strip only holds the text', async ($, on) => {
  const { ui } = await opened($, on, FILES)

  await ui.input({ key: 'goto', text: 'i', kind: 'change' })

  expect({ keys: (await buttons(ui)).map(({ key }) => key), held: await heldText(ui) }).toEqual({ keys: ['ask', 'champion-skills', 'minimap'], held: ['i'] })
})

test('switching tabs clears a part-typed Go to text', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': TEN }, [], gh(ISSUES))

  await ui.input({ key: 'goto', text: '1', kind: 'change' })
  await ui.press({ key: 'tab-issues' })

  expect(await heldText(ui)).toEqual([''])
})

test('a number typed on the issues tab opens that issue, and Back returns to the issues tab', async ($, on) => {
  const { ui, markdown } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'tab-issues' })
  await ui.input({ key: 'goto', text: '9' })
  const opened9 = await markdown()
  await ui.press({ key: 'back' })

  expect({ opened9, keys: (await buttons(ui)).map(({ key }) => key) }).toEqual({
    opened9: ['# #9 Fires spread too fast\n\n\nWildfire crosses a road in one tick.\nSecond line.'],
    keys: ['tab-proposals', 'tab-issues', 'ask', 'issue-9', 'issue-10'],
  })
})

test('running /next again resets to the proposals tab', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'tab-issues' })
  await $.command.run({ command: 'next', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } })

  expect(await buttons(ui)).toEqual([
    ...STRIP(false),
    ASK,
    { key: 'champion-skills', text: 'Champion skills', dim: false },
    { key: 'minimap', text: 'Minimap', dim: false },
  ])
})

test('an issue number in Go to opens that issue from the fetched body', async ($, on) => {
  const paths: string[] = []
  const { ui, markdown } = await opened($, on, {}, paths, gh(ISSUES))

  await ui.input({ key: 'goto', text: '9' })

  expect({ markdown: await markdown(), paths }).toEqual({
    markdown: ['# #9 Fires spread too fast\n\n\nWildfire crosses a road in one tick.\nSecond line.'],
    paths: ['/src/game/docs/proposals/README.md'],
  })
})

test('Start on an issue fills the issue opener and closes the pane', async ($, on) => {
  const { ui, asked } = await opened($, on, {}, [], gh(ISSUES))

  await ui.press({ key: 'issue-10' })
  await ui.press({ key: 'start' })

  expect(asked).toEqual(['open what-next', 'fill This session we are doing issue #10 (read it with `gh issue view 10`), please /checkpoint-plan', 'close what-next'])
})

const PROPOSALS = parse(TICKED)
const SOURCE = (count: number) => Array.from({ length: count }, (_, at) => ({ number: at + 1, title: `Issue ${at + 1}`, body: '' }))
const texts = async (ui: Awaited<ReturnType<typeof opened>>['ui']) => (await ui.findAll({ type: 'Text' })).map(({ text }) => text)

test('the summary counts open and parked proposals and names the next one', () => {
  expect(summary(PROPOSALS, null, null)).toEqual('1 proposal · 1 parked · next: wall-junctions')
})

test('the summary counts issues and the ones assigned to you, a known 0 included', () => {
  expect([summary(null, ISSUES, 1), summary(null, ISSUES, 0)]).toEqual(['2 issues · 1 assigned to you', '2 issues · 0 assigned to you'])
})

test('the summary leaves out the assigned count when it is unknown', () => {
  expect(summary(null, ISSUES, null)).toEqual('2 issues')
})

test('the summary joins both sources in order', () => {
  expect(summary(parse(NUMBERED), ISSUES, 1)).toEqual('2 proposals · 2 issues · 1 assigned to you · next: Champion skills')
})

test('the summary uses the singular for one proposal and one issue', () => {
  expect(summary([PROPOSALS[0]!], SOURCE(1), null)).toEqual('1 proposal · 1 issue · next: wall-junctions')
})

test('the summary writes 100+ issues when gh returned the limit', () => {
  expect(summary(null, SOURCE(100), 3)).toEqual('100+ issues · 3 assigned to you')
})

test('the summary has no next when every proposal is parked', () => {
  expect(summary([PROPOSALS[1]!], null, null)).toEqual('0 proposals · 1 parked')
})

test('the summary is the first Text of a both-sources pane, above the strip', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], { ...gh(ISSUES), assigned: [{ number: 9 }] })

  const drawn = (await ui.findAll({})).filter(({ type }) => type === 'Text' || type === 'Button').map(({ type, text }) => ({ type, text }))

  expect(drawn).toEqual([
    { type: 'Text', text: '2 proposals · 2 issues · 1 assigned to you · next: Champion skills' },
    { type: 'Button', text: 'Proposals p' },
    { type: 'Text', text: 'p' },
    { type: 'Button', text: 'Issues i' },
    { type: 'Text', text: 'i' },
    { type: 'Button', text: 'Ask which is next' },
    { type: 'Text', text: ' ' },
    { type: 'Text', text: '1' },
    { type: 'Button', text: 'Champion skills' },
    { type: 'Text', text: 'does deciding the unlock order give a build its shape?' },
    { type: 'Text', text: '2' },
    { type: 'Button', text: 'Minimap' },
    { type: 'Text', text: 'on a large map, can a player find their fires at 0.5× zoom?' },
  ])
})

test('the reader view draws no summary', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'minimap' })

  expect(await texts(ui)).toEqual([' '])
})

test('the bare one-line panes draw no summary', async ($, on) => {
  const none = (await opened($, on, {}, [], { gh: 'throws' })).ui
  expect(await texts(none)).toEqual([BOTH_ABSENT])
})

test('a lone README with no entries draws no summary', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': '# Proposals\n\nNone yet.\n' })

  expect(await texts(ui)).toEqual(['No proposals listed in docs/proposals/README.md.'])
})

test('a lone issues source with zero issues draws no summary', async ($, on) => {
  const { ui } = await opened($, on, {}, [], gh([]))

  expect(await texts(ui)).toEqual(['No open issues.'])
})

const ASKED = [
  'Which of these should I do next, and why? Recommend one.',
  '',
  'Proposals:',
  '1. Champion skills: does deciding the unlock order give a build its shape?',
  '2. Minimap: on a large map, can a player find their fires at 0.5× zoom?',
  '',
  'Issues: read the open ones with `gh issue list`.',
].join('\n')
const MIDDLE_PARKED = parse(`# Proposals

1. [One](one.md): first? Yes.

## Parked

2. [Two](two.md): second? Yes.

## Later

3. [Three](three.md): third? Yes.
`)

test('the ask text lists both sources, a parked proposal left out', () => {
  expect(ask([...parse(NUMBERED), { slug: 'late', name: 'Late', note: 'parked? Yes.', isParked: true }], ISSUES)).toEqual(ASKED)
})

test('the ask text keeps the pane number of a proposal that follows a parked one, with no Issues section', () => {
  expect(ask(MIDDLE_PARKED, null)).toEqual(
    'Which of these should I do next, and why? Recommend one.\n\nProposals:\n1. One: first?\n3. Three: third?',
  )
})

test('the ask text lists issues only, with no Proposals section', () => {
  expect(ask(null, ISSUES)).toEqual('Which of these should I do next, and why? Recommend one.\n\nIssues: read the open ones with `gh issue list`.')
})

test('the ask text has no Proposals section when every proposal is parked', () => {
  expect(ask([PROPOSALS[1]!], ISSUES)).toEqual('Which of these should I do next, and why? Recommend one.\n\nIssues: read the open ones with `gh issue list`.')
})

test('pressing ask in a both-sources pane fills the prompt with the question and closes the pane', async ($, on) => {
  const { ui, asked } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'ask' })

  expect(asked).toEqual(['open what-next', `fill ${ASKED}`, 'close what-next'])
})

test('the reader view draws no ask Button', async ($, on) => {
  const { ui } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.press({ key: 'minimap' })

  expect((await buttons(ui)).map(({ key }) => key)).toEqual(['back', 'start'])
})

test('the failed-source bare pane draws no ask Button', async ($, on) => {
  const { ui } = await opened($, on, {}, [], { gh: 'throws' })

  expect(await buttons(ui)).toEqual([])
})

test('the empty-README bare pane draws no ask Button', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': '# Proposals\n\nNone yet.\n' })

  expect(await buttons(ui)).toEqual([])
})

test('every proposal parked and no issues draws the summary and the row, and no ask Button', async ($, on) => {
  const { ui } = await opened($, on, { 'docs/proposals/README.md': '# Proposals\n\n## Parked\n\n- `auto-corners`: walls picking their own corner piece.\n' })

  expect({ buttons: await buttons(ui), texts: await texts(ui) }).toEqual({
    buttons: [{ key: 'auto-corners', text: 'auto-corners', dim: true }],
    texts: ['0 proposals · 1 parked', ' ', 'Parked', '1', 'walls picking their own corner piece.'],
  })
})

test('a in Go to is only held when there is nothing to ask about', async ($, on) => {
  const { ui, asked } = await opened($, on, { 'docs/proposals/README.md': '# Proposals\n\n## Parked\n\n- `auto-corners`: walls picking their own corner piece.\n' })

  await ui.input({ key: 'goto', text: 'a' })

  expect({ asked, held: await heldText(ui) }).toEqual({ asked: ['open what-next'], held: ['a'] })
})

test('typing a in Go to does the same as pressing the ask Button', async ($, on) => {
  const { ui, asked } = await opened($, on, FILES, [], gh(ISSUES))

  await ui.input({ key: 'goto', text: 'a', kind: 'change' })

  expect(asked).toEqual(['open what-next', `fill ${ASKED}`, 'close what-next'])
})

test('submitting a in Go to without a strip asks too', async ($, on) => {
  const { ui, asked } = await opened($, on, FILES)

  await ui.input({ key: 'goto', text: 'a' })

  expect(asked).toEqual(['open what-next', `fill ${ask(parse(NUMBERED), null)}`, 'close what-next'])
})

const desktop = async ($: Engine, on: On, files: Record<string, string>, host: Host) => {
  world(on, files, [], host)
  await $.command.run({ command: 'next', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } })

  return $.ui.mount({ ...PANE, surface: 'desktop' })
}
const TEXT = (children: string, props: object = {}) => ({ type: 'Text', ...(Object.keys(props).length > 0 ? { props } : {}), children: [children] })
const BOX = (props: object, ...children: object[]) => ({ type: 'Box', ...(Object.keys(props).length > 0 ? { props } : {}), ...(children.length > 0 ? { children } : {}) })
const HANDLE = { plugin: 'what-next', handle: 0 }
const TAB = (key: string, label: string, hotkey: string, count: string, isCurrent: boolean) => ({
  type: 'Button',
  props: { key, label: `${label} ${count}`, hotkey, variant: isCurrent ? 'primary' : 'secondary' },
  press: HANDLE,
  children: [`${label} `, TEXT(count, { dimColor: true })],
})
const TOOLBAR = (isIssues: boolean) =>
  BOX(
    { flexDirection: 'row', gap: 2, alignItems: 'center' },
    TAB('tab-proposals', 'Proposals', 'p', '2', !isIssues),
    TAB('tab-issues', 'Issues', 'i', '2', isIssues),
    { type: 'Button', props: { key: 'ask', label: 'Ask which is next', hotkey: 'a', plain: true }, press: HANDLE },
  )
const SUMMARY = TEXT('2 proposals · 2 issues · next: Champion skills', { color: '#8a949c', wrap: 'truncate-end' })
const FIELD = (placeholder: string) => ({
  type: 'Input',
  props: { key: 'goto', label: 'Go to', placeholder, value: '', submitLabel: 'open', autoFocus: true },
  press: HANDLE,
})
const ROW = (number: string, key: string, name: string, note: string, width: number, isParked = false, ...heading: object[]) =>
  BOX(
    { flexDirection: 'column', gap: 1 },
    ...heading,
    BOX(
      { flexDirection: 'row', gap: 2 },
      BOX({ width, flexShrink: 0, justifyContent: 'flex-end' }, TEXT(number, { color: '#ff8f40', dimColor: isParked })),
      BOX(
        { flexDirection: 'column', flexGrow: 1 },
        { type: 'Button', props: { key, label: name, plain: true, dimColor: isParked }, press: HANDLE },
        TEXT(note, { dimColor: true, wrap: 'truncate-end' }),
      ),
    ),
  )
const PARKED = TEXT('Parked', { bold: true, dimColor: true, weight: 'semibold' })
const withHandles = (tree: unknown) => JSON.parse(JSON.stringify(tree), (key, value) => (key === 'press' ? HANDLE : value))
const PAGE = (...children: object[]) => ({ ...BOX({ flexDirection: 'column', gap: 2, padding: 2 }, ...children), part: { plugin: 'what-next' } })

test('draws the proposals on Desktop as tab buttons with counts and a number column', async ($, on) => {
  const ui = await desktop($, on, FILES, gh(ISSUES))

  expect(withHandles(await ui.drawn())).toEqual(
    PAGE(
      TOOLBAR(false),
      SUMMARY,
      FIELD('1–2'),
      BOX(
        { flexDirection: 'column', gap: 1 },
        ROW('1', 'champion-skills', 'Champion skills', 'does deciding the unlock order give a build its shape?', 1),
        ROW('2', 'minimap', 'Minimap', 'on a large map, can a player find their fires at 0.5× zoom?', 1),
      ),
    ),
  )
  await ui.unmount()
})

test('draws the issues on Desktop with the # placeholder and a number column as wide as the widest number', async ($, on) => {
  const ui = await desktop($, on, FILES, gh(ISSUES))

  await ui.press({ key: 'tab-issues' })

  expect(withHandles(await ui.drawn())).toEqual(
    PAGE(
      TOOLBAR(true),
      SUMMARY,
      FIELD('#'),
      BOX(
        { flexDirection: 'column', gap: 1 },
        ROW('9', 'issue-9', 'Fires spread too fast', 'Wildfire crosses a road in one tick.', 2),
        ROW('10', 'issue-10', 'Minimap blank', '', 2),
      ),
    ),
  )
  await ui.unmount()
})

test('draws parked proposals on Desktop dim under a Parked heading, with the ask Button alone when there is one source', async ($, on) => {
  const ui = await desktop($, on, { 'docs/proposals/README.md': TICKED }, GH_FAILS)

  expect(withHandles(await ui.drawn())).toEqual(
    PAGE(
      BOX({ flexDirection: 'row', gap: 2, alignItems: 'center' }, { type: 'Button', props: { key: 'ask', label: 'Ask which is next', hotkey: 'a', plain: true }, press: HANDLE }),
      TEXT('1 proposal · 1 parked · next: wall-junctions', { color: '#8a949c', wrap: 'truncate-end' }),
      FIELD('1–2'),
      BOX(
        { flexDirection: 'column', gap: 1 },
        ROW('1', 'wall-junctions', 'wall-junctions', 'four players describe junctions they could not build.', 1),
        ROW('2', 'auto-corners', 'auto-corners', 'walls picking their own corner piece from neighbours.', 1, true, PARKED),
      ),
    ),
  )
  await ui.unmount()
})

test('counts each tab from its own source and gives the Desktop Go to field an unpadded range', async ($, on) => {
  const ui = await desktop($, on, { 'docs/proposals/README.md': TEN }, gh(ISSUES))

  const shape = async (key: string) => {
    const { type, props, children } = (await ui.find({ key })) ?? {}

    return { type, props, children }
  }
  const expected = ({ type, props, children = [] }: { type: string; props: object; children?: unknown[] }) => ({ type, props, children })

  expect({ proposals: await shape('tab-proposals'), issues: await shape('tab-issues'), field: await shape('goto') }).toEqual({
    proposals: expected(TAB('tab-proposals', 'Proposals', 'p', '10', true)),
    issues: expected(TAB('tab-issues', 'Issues', 'i', '2', false)),
    field: expected(FIELD('1–10')),
  })
})
