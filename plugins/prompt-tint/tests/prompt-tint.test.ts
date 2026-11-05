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

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([
    { text: 'shade my prompts', props: { color: '#d8d4cc', backgroundColor: BG } },
  ])
})

test('leaves a notification row to Claude Code', async ($, on) => {
  world(on)

  const ui = await $.ui.mount({ ...PROMPT, props: { ...PROMPT.props, origin: { kind: 'notification' } } })

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text, props }) => ({ text, props }))).toEqual([{ text: 'shade my prompts', props: {} }])
})
