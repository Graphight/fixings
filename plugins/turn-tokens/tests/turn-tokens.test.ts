import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { tally } from '../hooks/register'

const FOOTER = {
  plugin: 'turn-tokens',
  surface: 'terminal',
  component: 'TurnDuration',
  props: { word: 'Done', durationMs: 4200 },
} as const
const TURN = {
  reason: 'answer',
  answer: 'done',
  durationMs: 4200,
  isAborted: false,
  turnId: 't1',
  usage: {
    model: 'claude-opus-5',
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_input_tokens: 98_000,
    cache_creation_input_tokens: 0,
  },
} as const

// Claude Code's own footer, which the mod appends to.
const world = (on: On) => {
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, null, `${e.props.word} in 4.2s`))
}

test('puts the tokens on the end of the footer', async ($, on) => {
  world(on)

  await $.turn.complete(TURN)
  const ui = await $.ui.mount(FOOTER)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text }) => text)).toEqual(['Done in 4.2s', '  ·  1.2k in  ·  340 out  ·  98.0k cached'])
})

test('leaves the footer alone when the turn reported no usage', async ($, on) => {
  world(on)

  await $.turn.complete({ ...TURN, usage: undefined })
  const ui = await $.ui.mount(FOOTER)

  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.map(({ text }) => text)).toEqual(['Done in 4.2s'])
})

test('counts below a thousand stay exact', () => {
  expect(tally({ in: 999, out: 12, cached: 0 })).toEqual('999 in  ·  12 out')
})
