import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Issue, Proposal, Reading, Row, Tab } from '../types'

const PANE = 'what-next'
const DIR = 'docs/proposals'
const MUTED = '#8a949c'
const NUMBER = '#ff8f40'
const NAME_WIDTH = 23
const LIMIT = 100
// `1. [Title](slug.md): note` or `- \`slug\`: note`, the two ways a README lists its proposals.
const ENTRY = /^(?:\d+\.\s+\[([^\]]+)\]\(([^)]+)\.md\)|-\s+`([^`]+)`):\s*(.*)$/
const list = atom({ plugin: 'what-next', key: 'list' } as const, null as Proposal[] | null)
const issues = atom({ plugin: 'what-next', key: 'issues' } as const, null as Issue[] | null)
const tab = atom({ plugin: 'what-next', key: 'tab' } as const, 'proposals' as Tab)
const assigned = atom({ plugin: 'what-next', key: 'assigned' } as const, null as number | null)
const reading = atom({ plugin: 'what-next', key: 'reading' } as const, null as Reading | null)
// The Go to field's text, held here so that opening a row can clear it.
const typed = atom({ plugin: 'what-next', key: 'typed' } as const, '')

export const parse = (readme: string): Proposal[] => {
  const found: Proposal[] = []
  let isParked = false
  let open: Proposal | undefined

  for (const line of readme.split('\n')) {
    const entry = ENTRY.exec(line)

    if (entry) {
      const slug = entry[2] ?? entry[3] ?? ''
      open = { slug, name: entry[1] ?? slug, note: entry[4] ?? '', isParked }
      found.push(open)
    } else if (open && line.trim() !== '' && !line.startsWith('#')) {
      open.note += `\n${line}`
    } else {
      open = undefined
      isParked = line.startsWith('#') ? /parked/i.test(line) : isParked
    }
  }

  return found
}

export const summary = (proposals: Proposal[] | null, issues: Issue[] | null, mine: number | null): string => {
  const open = proposals?.filter(one => !one.isParked) ?? []
  const parked = (proposals?.length ?? 0) - open.length

  return [
    proposals && `${open.length} proposal${open.length === 1 ? '' : 's'}`,
    parked > 0 && `${parked} parked`,
    issues && `${issues.length === LIMIT ? `${LIMIT}+` : issues.length} issue${issues.length === 1 ? '' : 's'}`,
    issues && mine !== null && `${mine} assigned to you`,
    open[0] && `next: ${open[0].name}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const question = (note: string): string => /^.*?[.?!](?=\s|$)/.exec(note)?.[0] ?? note

export const ask = (proposals: Proposal[] | null, issues: Issue[] | null): string => {
  const open = (proposals ?? []).flatMap((one, at) => (one.isParked ? [] : [`${at + 1}. ${one.name}: ${question(one.note)}`]))

  return [
    'Which of these should I do next, and why? Recommend one.',
    open.length > 0 && `Proposals:\n${open.join('\n')}`,
    issues?.length && 'Issues: read the open ones with `gh issue list`.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const under = async ($: EngineInterface, path: string) => `${await $.session.root()}/${path}`

const show = async ($: EngineInterface, { key, name, note }: Row) => {
  const path = `${DIR}/${key}.md`
  const file = await under($, path)
  const text = (await $.fs.exists(file)) ? await $.fs.read(file) : `# ${name}\n\nNo \`${path}\`; the entry in the README is all there is.\n\n${note}`

  await update($, typed, () => '')
  await update($, reading, () => ({ name, text, opener: `This session we are doing the "${name}" proposal, please /checkpoint-plan` }))
}

const showIssue = async ($: EngineInterface, { number, title, body }: Issue) => {
  await update($, typed, () => '')
  await update($, reading, () => ({
    name: title,
    text: `# #${number} ${title}\n\n${body}`,
    opener: `This session we are doing issue #${number} (read it with \`gh issue view ${number}\`), please /checkpoint-plan`,
  }))
}

const listIssues = async <T,>($: EngineInterface, flags: string[]): Promise<T[] | null> => {
  try {
    const { exitCode, stdout } = await $.process.run(['gh', 'issue', 'list', ...flags, '--limit', String(LIMIT)], { timeoutMs: 10000 })
    const found: unknown = exitCode === 0 ? JSON.parse(stdout) : null

    return Array.isArray(found) ? (found as T[]) : null
  } catch {
    return null
  }
}

const start = async ($: EngineInterface, opener: string) => {
  await $.prompt.fill({ text: opener })
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if ((await $.fs.exists(await under($, `${DIR}/README.md`))) || (await $.session.repo())?.remote) {
      await $.command.register({ name: 'next', description: `Pick and read a proposal from ${DIR} or an open GitHub issue` })
    }

    return next(e)
  })

  on('command.run', { command: 'next' }, async $ => {
    const readme = await under($, `${DIR}/README.md`)
    const found = (await $.fs.exists(readme)) ? parse(await $.fs.read(readme)) : null
    const [open, mine] = await Promise.all([
      listIssues<Issue>($, ['--json', 'number,title,body']),
      listIssues<unknown>($, ['--assignee', '@me', '--json', 'number']),
    ])
    await update($, list, () => found)
    await update($, issues, () => open)
    await update($, assigned, () => mine?.length ?? null)
    await update($, reading, () => null)
    await update($, typed, () => '')
    await update($, tab, () => (found === null ? 'issues' : 'proposals'))
    await $.ui.open({ id: PANE, title: 'What next', focus: true })

    return { text: `${found?.length ?? 0} proposals and ${open?.length ?? 0} issues in the pane.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const proposals = await read($, list)
    const found = await read($, issues)
    const open = await read($, reading)

    if (open !== null) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={3}>
            <Button key="back" hotkey="b" plain autoFocus onPress={() => update($, reading, () => null)}>
              Back
            </Button>
            <Button key="start" hotkey="s" plain onPress={() => start($, open.opener)}>
              Start this one
            </Button>
          </Box>
          <Text> </Text>
          <Markdown text={open.text} />
        </Box>
      )
    }

    const hasStrip = proposals !== null && found !== null
    const isIssues = (await read($, tab)) === 'issues'

    if (proposals === null && found === null) {
      return <Text color={MUTED}>No {DIR}/README.md, and gh issue list gave no issues.</Text>
    }

    const switchTo = async (to: Tab) => {
      await update($, typed, () => '')
      await update($, tab, () => to)
    }
    const line = (proposals?.length ?? 0) + (found?.length ?? 0) > 0 ? summary(proposals, found, await read($, assigned)) : ''
    const hasAsk = (proposals ?? []).some(one => !one.isParked) || (found?.length ?? 0) > 0
    const asking = () => start($, ask(proposals, found))
    const strip = (hasStrip || hasAsk) && (
      <Box flexDirection="row" gap={3}>
        {hasStrip && (
          <Button key="tab-proposals" hotkey="p" variant={isIssues ? 'secondary' : 'primary'} dimColor={isIssues} onPress={() => switchTo('proposals')}>
            Proposals <Text dimColor>p</Text>
          </Button>
        )}
        {hasStrip && (
          <Button key="tab-issues" hotkey="i" variant={isIssues ? 'primary' : 'secondary'} dimColor={!isIssues} onPress={() => switchTo('issues')}>
            Issues <Text dimColor>i</Text>
          </Button>
        )}
        {hasAsk && (
          <Button key="ask" hotkey="a" plain onPress={asking}>
            Ask which is next
          </Button>
        )}
      </Box>
    )
    const head = (line !== '' || hasStrip) && (
      <Box flexDirection="column">
        {line !== '' && (
          <Text color={MUTED} wrap="truncate-end">
            {line}
          </Text>
        )}
        {strip}
        <Text> </Text>
      </Box>
    )

    if ((isIssues ? found : proposals)?.length === 0) {
      const none = <Text color={MUTED}>{isIssues ? 'No open issues.' : `No proposals listed in ${DIR}/README.md.`}</Text>

      return head ? (
        <Box flexDirection="column">
          {head}
          {none}
        </Box>
      ) : (
        none
      )
    }

    const all: Row[] = isIssues
      ? (found ?? []).map(({ number, title, body }) => ({
          key: `issue-${number}`,
          number: String(number),
          name: title,
          note: body.split('\n').find(line => line.trim() !== '') ?? '',
          isParked: false,
        }))
      : (proposals ?? []).map(({ slug, name, note, isParked }, at) => ({ key: slug, number: String(at + 1), name, note, isParked }))
    const pick = (row: Row) => {
      const issue = isIssues ? found?.find(one => `issue-${one.number}` === row.key) : undefined

      return issue === undefined ? show($, row) : showIssue($, issue)
    }
    const firstParked = all.findIndex(one => one.isParked)
    const width = Math.max(...all.map(one => one.number.length))
    const held = await read($, typed)
    const tabFor = (text: string): Tab | 'ask' | undefined =>
      hasAsk && text === 'a' ? 'ask' : !hasStrip ? undefined : text === 'p' ? 'proposals' : text === 'i' ? 'issues' : undefined
    const goTo = (text: string) => {
      const to = tabFor(text)

      if (to !== undefined) {
        return to === 'ask' ? asking() : switchTo(to)
      }

      const one = /^\d+$/.test(text) ? all.find(row => Number(row.number) === Number(text)) : undefined

      return one === undefined ? update($, typed, () => text) : pick(one)
    }

    let field = null

    if (e.surface !== 'mobile') {
      const { Input } = $.ui.resolve(e)
      field = (
        <Input
          key="goto"
          label="Go to"
          placeholder={isIssues ? '#' : `${e.surface === 'desktop' ? '1' : '1'.padStart(width, '0')}–${all.length}`}
          value={held}
          submitLabel="open"
          autoFocus
          onInput={text => (text.length === width || tabFor(text) !== undefined ? goTo(text) : update($, typed, () => text))}
          onSubmit={goTo}
        />
      )
    }

    if (e.surface === 'desktop') {
      return (
        <Box flexDirection="column" gap={2} padding={2}>
          {(hasStrip || hasAsk) && (
            <Box flexDirection="row" gap={2} alignItems="center">
              {hasStrip && (
                <Button key="tab-proposals" hotkey="p" variant={isIssues ? 'secondary' : 'primary'} onPress={() => switchTo('proposals')}>
                  Proposals <Text dimColor>{proposals.length}</Text>
                </Button>
              )}
              {hasStrip && (
                <Button key="tab-issues" hotkey="i" variant={isIssues ? 'primary' : 'secondary'} onPress={() => switchTo('issues')}>
                  Issues <Text dimColor>{found.length}</Text>
                </Button>
              )}
              {hasAsk && (
                <Button key="ask" hotkey="a" plain onPress={asking}>
                  Ask which is next
                </Button>
              )}
            </Box>
          )}
          {line !== '' && (
            <Text color={MUTED} wrap="truncate-end">
              {line}
            </Text>
          )}
          {field}
          <Box flexDirection="column" gap={1}>
            {all.map((one, at) => (
              <Box flexDirection="column" gap={1}>
                {at === firstParked && (
                  <Text weight="semibold" dimColor>
                    Parked
                  </Text>
                )}
                <Box flexDirection="row" gap={2}>
                  <Box width={width} flexShrink={0} justifyContent="flex-end">
                    <Text color={NUMBER} dimColor={one.isParked}>
                      {one.number}
                    </Text>
                  </Box>
                  <Box flexDirection="column" flexGrow={1}>
                    <Button key={one.key} plain dimColor={one.isParked} onPress={() => pick(one)}>
                      {one.name}
                    </Button>
                    <Text dimColor wrap="truncate-end">
                      {question(one.note)}
                    </Text>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {head}
        {field}
        {all.map((one, at) => (
          <Box flexDirection="column">
            {at === firstParked && (
              <Box flexDirection="column">
                {at > 0 && <Text> </Text>}
                <Text weight="semibold">Parked</Text>
              </Box>
            )}
            <Box flexDirection="row" gap={2}>
              <Box flexShrink={0}>
                <Text color={NUMBER} dimColor={one.isParked}>
                  {one.number.padStart(width, '0')}
                </Text>
              </Box>
              <Box minWidth={NAME_WIDTH} flexShrink={0}>
                <Button key={one.key} plain dimColor={one.isParked} onPress={() => pick(one)}>
                  {one.name}
                </Button>
              </Box>
              <Text color={MUTED} dimColor={one.isParked} wrap="truncate-end">
                {question(one.note)}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}
