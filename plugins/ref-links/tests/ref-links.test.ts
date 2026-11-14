import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const reply = (text: string) =>
  ({ plugin: 'ref-links', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as const

// The session's repo, and Claude Code's own drawing of the reply, which shows the text it was given.
const draw = async ($: Parameters<Parameters<typeof test>[1]>[0], on: On, remote: string | null, text: string) => {
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
