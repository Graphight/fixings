import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const reply = (text: string) =>
  ({ plugin: 'ref-links', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as const

// The session's repo, and Claude Code's own drawing of the reply, which shows the text it was given.
const draw = async ($: Engine, on: On, remote: string | null, text: string) => {
  on('session.repo', () => ({ value: remote === null ? null : { root: '/src/game', remote, internal: false, name: null } }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, null, e.props.text))

  return (await (await $.ui.mount(reply(text))).findAll({ type: 'Text' })).map(({ text }) => text)
}

const JIRA = { jiraUrl: 'https://example.atlassian.net', projects: 'PROJ, OPS' }

test('links Jira keys of the listed projects', { options: JIRA }, async ($, on) => {
  expect(await draw($, on, null, 'PROJ-12 and OPS-3, not UTF-8, XPROJ-1 or ABC-5')).toEqual([
    '[PROJ-12](https://example.atlassian.net/browse/PROJ-12) and [OPS-3](https://example.atlassian.net/browse/OPS-3), not UTF-8, XPROJ-1 or ABC-5',
  ])
})

test('links no Jira keys with empty config', async ($, on) => {
  expect(await draw($, on, null, 'PROJ-12')).toEqual(['PROJ-12'])
})

const GH = 'git@github.com:o/r.git'

for (const remote of [GH, 'https://github.com/o/r', 'https://github.com/o/r.git', 'ssh://git@github.com/o/r.git']) {
  test(`links #N to the session repo from ${remote}`, async ($, on) => {
    expect(await draw($, on, remote, 'see #3 now')).toEqual(['see [#3](https://github.com/o/r/issues/3) now'])
  })
}

test('leaves #N plain for a non-GitHub remote', async ($, on) => {
  expect(await draw($, on, 'git@gitlab.com:o/r.git', 'see #3')).toEqual(['see #3'])
})

test('leaves #N plain with no repo', async ($, on) => {
  expect(await draw($, on, null, 'see #3')).toEqual(['see #3'])
})

test('links owner/repo#N whatever the session repo is', async ($, on) => {
  expect(await draw($, on, null, 'see a/b#7.')).toEqual(['see [a/b#7](https://github.com/a/b/issues/7).'])
})

test('leaves code spans, fences, markdown links and autolinks as written', async ($, on) => {
  const text = 'a `#3` b\n```\n#3\n```\n[#3](https://x.test) <https://x.test/#3> and #4'

  expect(await draw($, on, GH, text)).toEqual([text.replace('and #4', 'and [#4](https://github.com/o/r/issues/4)')])
})

test('needs a non-word character around a reference', async ($, on) => {
  const text = 'abc#3 foo.md#3a #3a #3b'

  expect(await draw($, on, GH, text)).toEqual([text])
})

test('draws bare GitHub PR and issue URLs as repo#N, leaving linked ones alone', async ($, on) => {
  const linked = '[x](https://github.com/o/r/pull/9) <https://github.com/o/r/pull/9>'

  expect(await draw($, on, null, `https://github.com/a/b/pull/7 and https://github.com/a/b/issues/8. ${linked}`)).toEqual([
    `[b#7](https://github.com/a/b/pull/7) and [b#8](https://github.com/a/b/issues/8). ${linked}`,
  ])
})

test('leaves a GitHub URL with a tail, and any other URL, whole', { options: JIRA }, async ($, on) => {
  const urls = [
    'https://github.com/a/b/pull/7/files',
    'https://github.com/a/b/issues/7#issuecomment-99',
    'https://github.com/a/b/pull/7?w=1',
    'https://example.atlassian.net/browse/PROJ-1234',
    'https://example.com/docs/#3',
  ].join(' ')

  expect(await draw($, on, GH, `${urls} and PROJ-1`)).toEqual([`${urls} and [PROJ-1](https://example.atlassian.net/browse/PROJ-1)`])
})

const prompt = (text: string, kind: string) =>
  ({ plugin: 'ref-links', surface: 'terminal', component: 'UserMessage', props: { text, origin: { kind }, isFull: true } }) as const

const links = async ($: Engine, on: On, kind: string, nested: boolean) => {
  on('session.repo', () => ({ value: { root: '/src/game', remote: GH, internal: false, name: null } }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const text = h(Text, null, e.props.text)

    return nested ? h(Box, null, h(Box, null, text)) : text
  })

  const ui = await $.ui.mount(prompt('fix #3 and a/b#4 now', kind))

  return (await ui.findAll({ type: 'Link' })).map(({ text, props }) => [text.slice(props.href.length), props.href])
}

const LINKS = [
  ['#3', 'https://github.com/o/r/issues/3'],
  ['a/b#4', 'https://github.com/a/b/issues/4'],
]

test('links references in a typed prompt', async ($, on) => {
  expect(await links($, on, 'composer', false)).toEqual(LINKS)
})

test('links references in a prompt drawn as nested boxes', async ($, on) => {
  expect(await links($, on, 'composer', true)).toEqual(LINKS)
})

test('leaves a notification row alone', async ($, on) => {
  expect(await links($, on, 'task-notification', false)).toEqual([])
})
