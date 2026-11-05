import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const REPLY = {
  plugin: 'copy-visible',
  surface: 'terminal',
  component: 'AssistantMessage',
  props: { text: 'a reply', isFirstOfReply: true },
} as const
const BORDER = '#7fb0d0'
const BG = '#141d26'

// A press handle is an opaque number, so it is left out of a comparison.
const drawnBy = async (ui: { findAll: (query: { type: 'Box' }) => Promise<readonly { children?: unknown }[]> }) =>
  JSON.parse(JSON.stringify((await ui.findAll({ type: 'Box' }))[0]?.children, (key, value) => (key === 'press' ? undefined : value)))

const copyButton = { type: 'Button', props: { key: 'copy-1', label: ' Copy ', plain: true }, children: [{ type: 'Text', props: { backgroundColor: BG, color: BORDER, weight: 'semibold' }, children: ['Copy'] }] }

test('tints a framed block in the colours set in config', async ($, on) => {
  on('config.list', () => ({ value: [{ key: 'copy-visible.border', value: '#112233' }, { key: 'copy-visible.background', value: '#445566' }] }))
  on('ui.render', ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)

    return h(
      Box,
      { borderStyle: 'round' },
      h(Text, null, 'the code'),
      h(Box, { position: 'absolute', top: -1, right: 1 }, h(Button, { key: 'copy-1', label: ' Copy ', plain: true, onPress: () => {} })),
    ) as RenderElement
  })

  const ui = await $.ui.mount(REPLY)

  expect((await ui.findAll({ type: 'Box' }))[0]?.props).toEqual({ borderStyle: 'round', borderColor: '#112233', backgroundColor: '#445566' })
})

test('tints a framed block, draws its copy button as the first row inside the frame, and the press still lands', async ($, on) => {
  on('config.list', () => ({ value: [] }))
  const pressed: string[] = []

  // The skin's drawing of a reply: a framed block with its label and Copy on the top
  // border, a fold control, and `copy reply` beneath.
  on('ui.render', ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const button = (key: string, label: string) => h(Button, { key, label, plain: true, dimColor: true, onPress: () => pressed.push(key) })

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { borderStyle: 'round', borderColor: '#8a949c' },
        h(Text, { color: '#ffb454', backgroundColor: '#2a1f16' }, 'the code'),
        h(Box, { position: 'absolute', top: -1, left: 1 }, h(Text, null, ' markdown ')),
        h(Box, { position: 'absolute', top: -1, right: 1 }, button('copy-1', ' Copy ')),
      ),
      button('fold-1', 'more'),
      button('copy-reply', 'copy reply'),
    ) as RenderElement
  })

  const ui = await $.ui.mount(REPLY)

  expect(await drawnBy(ui)).toEqual([
    {
      type: 'Box',
      props: { borderStyle: 'round', borderColor: BORDER, backgroundColor: BG },
      children: [
        { type: 'Box', props: {}, children: [copyButton] },
        { type: 'Text', props: { backgroundColor: '#2a1f16', color: '#ffb454' }, children: ['the code'] },
        { type: 'Box', props: { position: 'absolute', top: -1, left: 1 }, children: [{ type: 'Text', props: { backgroundColor: BG }, children: [' markdown '] }] },
      ],
    },
    { type: 'Button', props: { key: 'fold-1', label: 'more', plain: true, dimColor: true } },
    { type: 'Button', props: { key: 'copy-reply', label: 'copy reply', plain: true, dimColor: true } },
  ])

  // The button keeps the stamp of the plugin beneath, so its own handler answers.
  await ui.press({ plugin: 'test', key: 'copy-1' })

  expect(pressed).toEqual(['copy-1'])
})

test('frames a fence the skin left unframed, one Text a line, with its copy button as the first row', async ($, on: On) => {
  on('config.list', () => ({ value: [] }))
  // The skin's drawing of a fence with no language tag: Claude Code's own block, and Copy flush right beneath.
  on('ui.render', ($, e) => {
    const { Box, Button, Markdown } = $.ui.resolve(e)

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column' },
        h(Markdown, { text: '```\nfirst\n\n\tthird\n```' }),
        h(Box, { flexDirection: 'row', justifyContent: 'flex-end' }, h(Button, { key: 'copy-1', label: ' Copy ', plain: true, dimColor: true, onPress: () => {} })),
      ),
      h(Markdown, { text: 'prose with no fence' }),
    ) as RenderElement
  })

  const ui = await $.ui.mount(REPLY)
  const line = (text: string) => ({ type: 'Text', props: { backgroundColor: BG }, children: [text] })

  expect(await drawnBy(ui)).toEqual([
    {
      type: 'Box',
      props: { flexDirection: 'column', marginY: 1 },
      children: [
        {
          type: 'Box',
          props: { flexDirection: 'column', borderStyle: 'round', paddingX: 1, borderColor: BORDER, backgroundColor: BG },
          children: [{ type: 'Box', props: {}, children: [copyButton] }, line('first'), line(' '), line('  third')],
        },
      ],
    },
    { type: 'Markdown', props: { text: 'prose with no fence' } },
  ])
})
