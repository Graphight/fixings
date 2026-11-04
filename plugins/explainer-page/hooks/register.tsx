import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Check, Harness, Mark, Page, Published } from '../types'

const PANE = 'explainer-page-checks'
const LABEL_WIDTH = 10
const NAME_WIDTH = 11
const NOTE_ROWS = 3
const HEADING_MAX = 45
const NODE_TIMEOUT_MS = 10000
const MARKER = 'data-theme-set'
const HARNESS = /\bnode\s+\S*harness\S*\.js\b/
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/
const DATE = /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/
const SYNTAX = "new (require('vm').Script)(require('fs').readFileSync(0, 'utf8'))"
const TELLS = [
  'emphatically',
  'simply put',
  "it's worth noting",
  "let's be honest",
  "isn't that something",
  'the whole point is',
  "so here's the thing",
  'read that again',
  'this is the big one',
  'and that changes everything',
]
const PLACEHOLDERS = [
  'Page Name',
  'subtitle · context',
  'Org · Context',
  'A claim that lands',
  'First section',
  'Section name',
  'A short noun phrase',
  'Widget name · scope',
  "A question the section's argument answers",
  'The plausible misreading',
  'Why the right answer is right',
]
const MARKS = {
  pass: ['✓ ', { color: 'success' }],
  warn: ['! ', { color: 'warning' }],
  fail: ['✗ ', { color: 'error' }],
  pending: ['○ ', { dimColor: true }],
  skipped: ['– ', { dimColor: true }],
} as const
const NAMES = { pass: {}, warn: { weight: 'semibold' }, fail: { weight: 'semibold' }, pending: { dimColor: true }, skipped: { dimColor: true } } as const
const OPEN = { id: PANE, title: 'Explainer checks', columns: 60 }

const page = atom({ plugin: 'explainer-page', key: 'page' } as const, null as Page | null)
const harness = atom({ plugin: 'explainer-page', key: 'harness' } as const, null as Harness | null)
const published = atom({ plugin: 'explainer-page', key: 'published' } as const, null as Published | null)

const check = (name: string, mark: Mark, detail: string, notes: string[] = []): Check => ({ name, mark, detail, notes })

const hashOf = (text: string): number => {
  let hash = 5381

  for (let at = 0; at < text.length; at++) {
    hash = ((hash * 33) ^ text.charCodeAt(at)) >>> 0
  }

  return hash
}

const plain = (html: string): string =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|’/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const visible = (html: string): string => plain(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''))

const dated = (html: string): Check => {
  const found = visible(html).match(DATE)

  return html.includes('DD Mon YYYY')
    ? check('dated', 'fail', 'scaffold date left in')
    : found
      ? check('dated', 'pass', `checked ${found[0]}`)
      : check('dated', 'fail', 'no checked-on date')
}

const headings = (html: string): Check => {
  const all = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(([, inner = '']) => plain(inner))
  const long = all.filter(text => text.length > HEADING_MAX)

  return all.length === 0
    ? check('headings', 'skipped', 'no h2 headings')
    : long.length === 0
      ? check('headings', 'pass', `${all.length} of ${all.length} ≤ ${HEADING_MAX} chars`)
      : check('headings', 'fail', `${long.length} over ${HEADING_MAX} chars`, long.map(text => `${text.length}  ${text}`))
}

const quizzes = (html: string): Check => {
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)].map(([, attrs = '', body = ''], at) => ({
    name: `#${attrs.match(/\bid="([^"]+)"/)?.[1] ?? at + 1}`,
    blocks: [...body.matchAll(/class="quiz-opts"[^>]*>([\s\S]*?)<\/div>/gi)].map(([, inner = '']) =>
      [...inner.matchAll(/<button\b([^>]*)>/gi)].map(([, button = '']) => /\bdata-right\b/.test(button)),
    ),
  }))
  const missing = sections.filter(one => one.blocks.length === 0).map(one => one.name)
  const wrong = sections.flatMap(one =>
    one.blocks.flatMap(rights => {
      const count = rights.filter(Boolean).length

      return count === 1 ? [] : [`${one.name}: ${count} right answers`]
    }),
  )
  const slots = sections.flatMap(one => one.blocks.filter(rights => rights.filter(Boolean).length === 1).map(rights => rights.indexOf(true)))
  const isStuck = slots.length >= 3 && slots.every(slot => slot === slots[0])
  const notes = [
    ...wrong,
    ...(missing.length > 0 ? [`no quiz: ${missing.join(', ')}`] : []),
    ...(isStuck ? [`right answer always option ${(slots[0] ?? 0) + 1}`] : []),
  ]
  const quizzed = sections.length - missing.length

  return sections.length === 0
    ? check('quizzes', 'skipped', 'no sections')
    : wrong.length > 0
      ? check('quizzes', 'fail', `${wrong.length} without one right answer`, notes)
      : notes.length > 0
        ? check('quizzes', 'warn', `${quizzed} of ${sections.length} sections`, notes)
        : check('quizzes', 'pass', `${quizzed} of ${sections.length} sections, one right each`)
}

const voice = (html: string): Check => {
  const text = visible(html).toLowerCase()
  const found = TELLS.filter(tell => text.includes(tell))

  return found.length === 0
    ? check('voice', 'pass', 'no tells found')
    : check('voice', 'warn', `${found.length} ${found.length === 1 ? 'tell' : 'tells'}`, found.map(tell => `“${tell}”`))
}

const scaffold = (html: string): Check => {
  const found = PLACEHOLDERS.filter(text => html.includes(text))

  return found.length === 0
    ? check('scaffold', 'pass', 'no placeholder text')
    : check('scaffold', 'fail', `${found.length} placeholder${found.length === 1 ? '' : 's'} left`, found)
}

const script = async ($: EngineInterface, html: string): Promise<Check> => {
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs = '']) => !/\bsrc=/i.test(attrs) && !/\btype="(?!text\/javascript")/i.test(attrs))
    .map(([, , body = '']) => body)

  if (inline.length === 0) {
    return check('script', 'skipped', 'no inline script')
  }

  try {
    const errors: string[] = []

    for (const [at, body] of inline.entries()) {
      const { exitCode, stderr } = await $.process.run(['node', '-e', SYNTAX], { stdin: body, timeoutMs: NODE_TIMEOUT_MS })

      if (exitCode !== 0) {
        errors.push(`script ${at + 1}: ${stderr.match(/^\w*Error: .*$/m)?.[0] ?? `node exited ${exitCode}`}`)
      }
    }

    return errors.length === 0 ? check('script', 'pass', `${inline.length} parsed`) : check('script', 'fail', `${errors.length} did not parse`, errors)
  } catch {
    return check('script', 'pending', 'node not found')
  }
}

const harnessCheck = (shown: Page, ran: Harness | null): Check =>
  !shown.hasWidgets
    ? check('harness', 'skipped', 'no widgets')
    : ran === null
      ? check('harness', 'pending', 'not run')
      : !ran.isPassed
        ? check('harness', 'fail', 'last run failed')
        : ran.at < shown.wroteAt
          ? check('harness', 'warn', 'page changed since the last run')
          : check('harness', 'pass', 'passed')

const publishedCheck = (shown: Page, out: Published | null): Check =>
  out?.path !== shown.path
    ? check('published', 'pending', 'not published')
    : out.hash !== shown.hash
      ? check('published', 'warn', 'changed since publish', out.url ? [out.url.replace('https://', '')] : [])
      : check('published', 'pass', out.url ? out.url.replace('https://', '') : 'published')

const inspect = async ($: EngineInterface, path: string): Promise<boolean> => {
  const html = await $.fs.read(path).catch(() => '')

  if (!html.includes(MARKER)) {
    return false
  }

  const checks = [dated(html), headings(html), quizzes(html), voice(html), scaffold(html), await script($, html)]
  const hash = hashOf(html)
  const now = await $.clock.now()
  const kept = await read($, page)

  if (kept?.path !== path) {
    await update($, harness, () => null)
  }

  await update($, page, () => ({
    path,
    hash,
    wroteAt: kept?.path === path && kept.hash === hash ? kept.wroteAt : now,
    hasWidgets: /class="rig"|<canvas\b/.test(html),
    checks,
  }))

  return true
}

const absolute = async ($: EngineInterface, path: string): Promise<string> => (path.startsWith('/') ? path : `${await $.session.cwd()}/${path}`)

const show = async ($: EngineInterface) => {
  if (!(await $.ui.open(OPEN)).isPlaced) {
    $.ui.toast('Widen the terminal or run /explainer-page-checks')
  }
}

const isExplainer = (name: string): boolean => name === 'explainer-page' || name.endsWith(':explainer-page')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'explainer-page-checks', description: "Show the explainer page's pre-publish checklist in a pane" })

    return next(e)
  })

  on('command.run', { command: 'explainer-page-checks' }, async $ => {
    const shown = await read($, page)
    const isFound = shown !== null && (await inspect($, shown.path))

    await show($)

    return { text: isFound ? 'Checklist in the pane.' : 'No explainer page written in this session yet.' }
  })

  on('skill.prompt', async ($, e, next) => {
    if (isExplainer(e.skill)) {
      await show($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny !== undefined || ran.isError === true) {
      if (e.tool === 'Bash' && HARNESS.test(e.command)) {
        const now = await $.clock.now()

        await update($, harness, () => ({ isPassed: false, at: now }))
      }

      return ran
    }

    if ((e.tool === 'Write' || e.tool === 'Edit') && e.file_path.endsWith('.html')) {
      await inspect($, e.file_path)
    } else if (e.tool === 'Bash') {
      const followed = (await read($, page))?.path

      if (HARNESS.test(e.command)) {
        const now = await $.clock.now()

        await update($, harness, () => ({ isPassed: true, at: now }))
      }

      if (followed && e.command.includes(followed.slice(followed.lastIndexOf('/') + 1))) {
        await inspect($, followed)
      }
    } else if (e.tool === 'Artifact' && (e.action ?? 'publish') === 'publish' && e.file_path && !e.asset) {
      const path = await absolute($, e.file_path)

      if (await inspect($, path)) {
        const url = `${JSON.stringify(ran.result ?? '')} ${String(ran.text ?? '')}`.match(ARTIFACT_URL)?.[0]
        const hash = (await read($, page))?.hash ?? 0

        await update($, published, kept => ({ path, url: url ?? (kept?.path === path ? kept.url : ''), hash }))
      }
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const shown = await read($, page)
    const rows = shown === null ? [] : [...shown.checks, harnessCheck(shown, await read($, harness)), publishedCheck(shown, await read($, published))]
    const name = shown === null ? '' : shown.path.slice(shown.path.lastIndexOf('/') + 1)
    const tally = (mark: Mark) => rows.filter(one => one.mark === mark).length
        const noteProps = (mark: Mark) => (mark === 'fail' || mark === 'warn' ? {} : { dimColor: true })

    if (e.surface === 'desktop') {
      const chip = (label: string, color: string, backgroundColor: string) => (
        <Text color={color} backgroundColor={backgroundColor}>{` ${label} `}</Text>
      )
      const chips = [
        tally('pass') > 0 && chip(`✓ ${tally('pass')} passed`, 'success', 'diffAddedDimmed'),
        tally('warn') > 0 && chip(`! ${tally('warn')} to look at`, 'warning', 'inactive'),
        tally('fail') > 0 && chip(`✗ ${tally('fail')} failed`, 'error', 'diffRemovedDimmed'),
        tally('pending') > 0 && chip(`○ ${tally('pending')} to do`, 'inactive', 'inactive'),
      ].filter(Boolean)

      return (
        <Box flexDirection="column" gap={2} padding={2}>
          {shown === null ? (
            <Text dimColor>no explainer page written yet</Text>
          ) : (
            <Box flexDirection="column" gap={2}>
              <Box flexDirection="column">
                <Text dimColor>explainer</Text>
                <Text weight="semibold">{name}</Text>
              </Box>
              <Box flexDirection="column" gap={1}>
                <Text dimColor weight="semibold">
                  CHECKS
                </Text>
                <Box flexWrap="wrap" gap={1}>
                  {chips}
                </Box>
              </Box>
              <Box flexDirection="column" gap={1}>
                {rows.map(one => (
                  <Box flexDirection="column">
                    <Box gap={1}>
                      <Text {...MARKS[one.mark][1]}>{MARKS[one.mark][0].trim()}</Text>
                      <Text {...NAMES[one.mark]}>{one.name}</Text>
                      <Text dimColor>{one.detail}</Text>
                    </Box>
                    {one.notes.length > 0 && (
                      <Box flexDirection="column" paddingLeft={2}>
                        {one.notes.map(note => (
                          <Text {...noteProps(one.mark)}>{note}</Text>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    const counts = (['pass', 'warn', 'fail', 'pending'] as const)
      .filter(mark => tally(mark) > 0)
      .flatMap((mark, at) => [
        ...(at === 0 ? [] : [<Text>{'  '}</Text>]),
        <Text {...MARKS[mark][1]}>{`${MARKS[mark][0]}${tally(mark)}`}</Text>,
      ])

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.scroll.bodyRows}>
        <Box justifyContent="space-between">
          <Text dimColor>{shown === null ? 'explainer' : `explainer · ${name}`}</Text>
          <Text dimColor>/explainer-page-checks</Text>
        </Box>
        <Text> </Text>
        {shown === null ? (
          <Text dimColor>no explainer page written yet</Text>
        ) : (
          <Box flexDirection="column">
            <Box>
              <Text dimColor>{'CHECKS'.padEnd(LABEL_WIDTH)}</Text>
              {counts}
            </Box>
            {rows.flatMap((one, at) => {
              const isLast = at === rows.length - 1
              const shownNotes = one.notes.length > NOTE_ROWS ? [...one.notes.slice(0, NOTE_ROWS - 1), `+${one.notes.length - NOTE_ROWS + 1} more`] : one.notes

              return [
                <Box>
                  <Text dimColor>{isLast ? '└─ ' : '├─ '}</Text>
                  <Text {...MARKS[one.mark][1]}>{MARKS[one.mark][0]}</Text>
                  <Text {...NAMES[one.mark]}>{one.name.padEnd(NAME_WIDTH)}</Text>
                  <Text wrap="truncate-end" {...(one.mark === 'pending' || one.mark === 'skipped' ? { dimColor: true } : {})}>
                    {one.detail}
                  </Text>
                </Box>,
                ...shownNotes.map(note => (
                  <Box>
                    <Text dimColor>{isLast ? '     ' : '│    '}</Text>
                    <Text wrap="truncate-end" {...noteProps(one.mark)}>
                      {note}
                    </Text>
                  </Box>
                )),
              ]
            })}
          </Box>
        )}
      </Box>
    )
  })
}
