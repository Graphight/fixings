import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/src/notes', surface: 'terminal', isInteractive: true } as const
const PANE = {
  plugin: 'explainer-page',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'explainer-page-checks',
  viewport: { columns: 60, rows: 24 },
  props: {
    title: 'Explainer checks',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const PATH = '/src/notes/page.html'
const URL = 'https://claude.ai/artifact/abc123'
const LINE = (text: string, props: object = {}) => ({ text, props })
const DIM = (text: string) => LINE(text, { dimColor: true })
const TOP = [DIM('explainer · page.html'), DIM('/explainer-page-checks'), LINE(' ')]
const ROW = (spine: string, mark: string, markProps: object, name: string, nameProps: object, detail: string, detailProps: object = {}) => [
  DIM(spine),
  LINE(mark, markProps),
  LINE(name.padEnd(11), nameProps),
  LINE(detail, { wrap: 'truncate-end', ...detailProps }),
]
const NOTE = (spine: string, text: string, props: object = {}) => [DIM(spine), LINE(text, { wrap: 'truncate-end', ...props })]
const PASS = (name: string, detail: string, spine = '├─ ') => ROW(spine, '✓ ', { color: 'success' }, name, {}, detail)
const SKIP = (name: string, detail: string, spine = '├─ ') => ROW(spine, '– ', { dimColor: true }, name, { dimColor: true }, detail, { dimColor: true })
const PENDING = (name: string, detail: string, spine = '├─ ') => ROW(spine, '○ ', { dimColor: true }, name, { dimColor: true }, detail, { dimColor: true })
const WARN = (name: string, detail: string, spine = '├─ ') => ROW(spine, '! ', { color: 'warning' }, name, { weight: 'semibold' }, detail)
const FAIL = (name: string, detail: string, spine = '├─ ') => ROW(spine, '✗ ', { color: 'error' }, name, { weight: 'semibold' }, detail)

const quiz = (rights: boolean[]) =>
  `<div class="quiz"><div class="quiz-opts">${rights.map(right => `<button type="button"${right ? ' data-right' : ''}>x</button>`).join('')}</div></div>`

const section = (id: string, heading: string, rights: boolean[] | null) =>
  `<section id="${id}"><h2>${heading}</h2><p>Body.</p>${rights ? quiz(rights) : ''}</section>`

const CLEAN =
  '<button data-theme-set="auto">Auto</button><div class="rail-note">Read from the repo,<br>21 Oct 2026.</div>' +
  section('a', 'One card, advertised as three', [true, false, false]) +
  section('b', 'The queue behind the pool', [false, true, false]) +
  section('c', 'What the metrics hide', [false, false, true]) +
  '<script>var x = 1</script>'

const BROKEN =
  '<button data-theme-set="auto">Auto</button><div class="rail-note">Read from the repo,<br>DD Mon YYYY.</div>' +
  section('a', 'The device plugin tells a useful lie, and the GPU keeps a queue', [true, true, false]) +
  section('b', 'Section name', null) +
  "<p>So here's the thing about it.</p><div class=\"rig\"></div>" +
  '<script>var x = ;</script><script src="https://cdn.example/lib.js"></script>'

const world = (on: On, files: Record<string, string>, isPlaced = true) => {
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/src/notes' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: isPlaced ? { isPlaced } : { isPlaced, reason: 'terminal too narrow' } }))
  on('fs.read', (_, e) => {
    const text = files[e.path]

    return text === undefined ? { deny: `unexpected read of ${e.path}` } : { value: text }
  })
  on('process.run', (_, e) => {
    const isBroken = String(e.init?.stdin ?? '').includes('= ;')

    return {
      value: {
        exitCode: isBroken ? 1 : 0,
        stdout: '',
        stderr: isBroken ? "evalmachine.<anonymous>:1\nSyntaxError: Unexpected token ';'\n    at new Script" : '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('tool.call', (_, e) => ({ result: '', text: e.tool === 'Artifact' ? `Published ${URL}` : '' }))

  return clock
}

const rowsOf = async ($: Engine) => {
  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Text' })).map(({ text, props }) => ({ text, props }))
  await ui.unmount()

  return rows
}

const WRITE = { tool: 'Write', file_path: PATH, content: '' } as const

test('says no page has been written before any scaffold page is', async ($, on) => {
  world(on, { [PATH]: '<p>not a scaffold page</p>' })
  await $.session.start(START)
  await $.tool.call(WRITE)

  expect(await rowsOf($)).toEqual([DIM('explainer'), DIM('/explainer-page-checks'), LINE(' '), DIM('no explainer page written yet')])
})

test('lists every failing check with its notes', async ($, on) => {
  world(on, { [PATH]: BROKEN })
  await $.session.start(START)
  await $.tool.call(WRITE)

  expect(await rowsOf($)).toEqual([
    ...TOP,
    DIM('CHECKS    '),
    LINE('! 1', { color: 'warning' }),
    LINE('  '),
    LINE('✗ 5', { color: 'error' }),
    LINE('  '),
    LINE('○ 2', { dimColor: true }),
    ...FAIL('dated', 'scaffold date left in'),
    ...FAIL('headings', '1 over 45 chars'),
    ...NOTE('│    ', '63  The device plugin tells a useful lie, and the GPU keeps a queue'),
    ...FAIL('quizzes', '1 without one right answer'),
    ...NOTE('│    ', '#a: 2 right answers'),
    ...NOTE('│    ', 'no quiz: #b'),
    ...WARN('voice', '1 tell'),
    ...NOTE('│    ', "“so here's the thing”"),
    ...FAIL('scaffold', '1 placeholder left'),
    ...NOTE('│    ', 'Section name'),
    ...FAIL('script', '1 did not parse'),
    ...NOTE('│    ', "script 1: SyntaxError: Unexpected token ';'"),
    ...PENDING('harness', 'not run'),
    ...PENDING('published', 'not published', '└─ '),
  ])
})

test('passes a clean page once the harness has run and the page is published', async ($, on) => {
  world(on, { [PATH]: CLEAN })
  await $.session.start(START)
  await $.tool.call(WRITE)
  await $.tool.call({ tool: 'Artifact', file_path: 'page.html' })

  expect(await rowsOf($)).toEqual([
    ...TOP,
    DIM('CHECKS    '),
    LINE('✓ 7', { color: 'success' }),
    ...PASS('dated', 'checked 21 Oct 2026'),
    ...PASS('headings', '3 of 3 ≤ 45 chars'),
    ...PASS('quizzes', '3 of 3 sections, one right each'),
    ...PASS('voice', 'no tells found'),
    ...PASS('scaffold', 'no placeholder text'),
    ...PASS('script', '1 parsed'),
    ...SKIP('harness', 'no widgets'),
    ...PASS('published', 'claude.ai/artifact/abc123', '└─ '),
  ])
})

test('flags the harness and the publish as stale after the page changes', async ($, on) => {
  const files = { [PATH]: `${CLEAN}<div class="rig"></div>` }
  const clock = world(on, files)
  await $.session.start(START)
  await $.tool.call(WRITE)
  await clock.advance(1000)
  await $.tool.call({ tool: 'Bash', command: 'node /tmp/harness.js' })
  await $.tool.call({ tool: 'Artifact', file_path: PATH })
  await clock.advance(1000)
  files[PATH] = `${CLEAN}<div class="rig"></div><p>more</p>`
  await $.tool.call({ tool: 'Edit', file_path: PATH, old_string: 'a', new_string: 'b' })

  expect((await rowsOf($)).slice(-10)).toEqual([
    ...WARN('harness', 'page changed since the last run'),
    ...WARN('published', 'changed since publish', '└─ '),
    ...NOTE('     ', 'claude.ai/artifact/abc123'),
  ])
})

test('opens the pane when explainer-page expands, bare or namespaced, and not for another skill', async ($, on) => {
  const toasts: string[] = []
  world(on, {}, false)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  await $.skill.prompt({ skill: 'commit', text: '' })
  const before = [...toasts]
  await $.skill.prompt({ skill: 'explainer-page', text: '' })
  await $.skill.prompt({ skill: 'explainer-page:explainer-page', text: '' })

  expect({ before, toasts }).toEqual({ before: [], toasts: ['Widen the terminal or run /explainer-page-checks', 'Widen the terminal or run /explainer-page-checks'] })
})
