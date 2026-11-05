import type { On, ToolCallResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { isMasked } from '../hooks/register'

const BAND = {
  plugin: 'evidence-band',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const
const PASSED = { result: { stdout: 'ok', stderr: '', interrupted: false } }
const FAILED: ToolCallResult = { isError: true, result: 'Exit code 2\n1 failing', text: 'Exit code 2\n1 failing' }

// Claude Code's own Bash tool, answering every call with `ran`, and the band beneath the mod's.
const world = (on: On, ran: ToolCallResult = PASSED) => {
  on('tool.call', () => ran)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'beneath' }))
}

const drawn = async ($: Engine) =>
  (await (await $.ui.mount(BAND)).findAll({ type: 'Text' })).map(({ text, props }) => ({ text, color: props.color }))

test('a passing run draws its exit status and command', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'Bash', command: 'cd /src && npm test' })

  expect(await drawn($)).toEqual([
    { text: '✓ exit 0', color: 'success' },
    { text: '  ·  cd /src && npm test', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a failing run draws the status its error text starts with', async ($, on) => {
  world(on, FAILED)

  await $.tool.call({ tool: 'Bash', command: './gradlew build' })

  expect(await drawn($)).toEqual([
    { text: '✗ exit 2', color: 'error' },
    { text: '  ·  ./gradlew build', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a piped run is drawn as another command\'s status', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'Bash', command: 'npm test 2>&1 | tail -5' })

  expect(await drawn($)).toEqual([
    { text: "? exit 0, maybe a later command's", color: 'warning' },
    { text: '  ·  npm test 2>&1 | tail -5', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a run with no status to read is drawn as unknown', async ($, on) => {
  world(on, { isError: true, result: 'Command timed out', text: 'Command timed out' })

  await $.tool.call({ tool: 'Bash', command: 'pytest' })

  expect(await drawn($)).toEqual([
    { text: '? no exit status', color: 'warning' },
    { text: '  ·  pytest', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a backgrounded run is drawn as unknown', async ($, on) => {
  world(on, { result: { ...PASSED.result, backgroundTaskId: 'b1' } })

  await $.tool.call({ tool: 'Bash', command: 'make', run_in_background: true })

  expect(await drawn($)).toEqual([
    { text: '? no exit status', color: 'warning' },
    { text: '  ·  make', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a command that is not a runner leaves the last run drawn', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'Bash', command: 'cargo test' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "truncate the command (make it fit); npm test"' })

  expect(await drawn($)).toEqual([
    { text: '✓ exit 0', color: 'success' },
    { text: '  ·  cargo test', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('a sub-agent\'s run leaves the last main-loop run drawn', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'Bash', command: 'cargo test' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'sub-1' })

  expect(await drawn($)).toEqual([
    { text: '✓ exit 0', color: 'success' },
    { text: '  ·  cargo test', color: 'subtle' },
    { text: 'beneath', color: undefined },
  ])
})

test('nothing is drawn before a runner has run', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(await drawn($)).toEqual([{ text: 'beneath', color: undefined }])
})

test('what follows a runner decides whether its status is masked', () => {
  expect(
    [
      'npm test',
      'cd /src && npm test && echo ok',
      'yes | npm test',
      'npm test | tail -5',
      'npm test; echo done',
      'npm test || true',
      'npm test\necho done',
      'set -o pipefail; npm test | tail -5',
      'set -o pipefail; npm test | tail -5; echo done',
      'set -o pipefail; npm test || true',
      'npm test &',
      'npm test > out.log 2>&1 &',
      'npm test > out.log 2>&1',
      'npm test &> out.log',
      'npm test -- --grep "a|b; c"',
    ].map(isMasked),
  ).toEqual([false, false, false, true, true, true, true, false, true, true, true, true, false, false, false])
})
