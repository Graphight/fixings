import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PROMPT = {
  plugin: 'prompt-tint',
  surface: 'terminal',
  component: 'UserMessage',
  props: { text: 'shade my prompts', origin: { kind: 'composer' }, isFull: true },
} as const
const BG = '#241a12'

// Claude Code's own drawing of the row, which a tinted prompt replaces.
const world = (on: On) => {
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, null, e.props.text))
}

test('draws a typed prompt tinted and bordered', async ($, on) => {
  world(on)

  const ui = await $.ui.mount(PROMPT)

  const drawn = await ui.findAll({ type: 'Text' })
  const boxes = await ui.findAll({ type: 'Box' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    { text: 'shade my prompts', props: { color: '#d8d4cc', backgroundColor: BG } },
  ])
  expect(boxes.map(({ props }) => props)).toEqual([
    { flexDirection: 'column', alignItems: 'flex-start', marginY: 1 },
    { borderStyle: 'round', borderColor: '#ff8f40', backgroundColor: BG, paddingX: 1, flexShrink: 1 },
  ])
})

test('draws a typed prompt in the colours set in config', { options: { background: '#001122', text: '#aabbcc' } }, async ($, on) => {
  world(on)

  const ui = await $.ui.mount(PROMPT)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ props }) => props)).toEqual([{ color: '#aabbcc', backgroundColor: '#001122' }])
})

test('leaves a notification row to Claude Code', async ($, on) => {
  world(on)

  const ui = await $.ui.mount({ ...PROMPT, props: { ...PROMPT.props, origin: { kind: 'notification' } } })

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([{ text: 'shade my prompts', props: {} }])
})
