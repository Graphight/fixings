import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const dialog = (metadataSource?: string) =>
  ({
    plugin: 'interview',
    surface: 'terminal',
    component: 'AskUserQuestion',
    props: { tool: 'AskUserQuestion', questions: [], metadataSource },
  }) as const

// Claude Code's own dialog, the one engine node the mod's row sits above.
const world = (on: On) => on('ui.render', () => ({ type: 'engine', ref: 0 }) as const)

const drawn = async ($: Engine, metadataSource?: string) =>
  (await (await $.ui.mount(dialog(metadataSource))).findAll({ type: 'Text' })).map(({ text, props }) => ({
    text,
    color: props.color,
  }))

test('a tagged question draws its round, topic and dots above the dialog', async ($, on) => {
  world(on)

  expect(await drawn($, 'interview:2/3:behaviour')).toEqual([
    { text: 'Interview · round 2 of ~3 · behaviour  ', color: 'subtle' },
    { text: '●●', color: 'suggestion' },
    { text: '○', color: 'subtle' },
  ])
})

test('a round past the expected count raises the count to the round', async ($, on) => {
  world(on)

  expect(await drawn($, 'interview:4/3:scope')).toEqual([
    { text: 'Interview · round 4 of ~4 · scope  ', color: 'subtle' },
    { text: '●●●●', color: 'suggestion' },
    { text: '', color: 'subtle' },
  ])
})

test('an untagged question draws the dialog alone', async ($, on) => {
  world(on)

  expect(await drawn($, 'remember')).toEqual([])
  expect(await drawn($)).toEqual([])
})
