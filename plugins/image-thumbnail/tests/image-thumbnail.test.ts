import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/src/widgets', surface: 'terminal', isInteractive: true } as const
const BAND = {
  plugin: 'image-thumbnail',
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

const BENEATH = { text: 'beneath', color: undefined, dimColor: undefined }
const chip = (n: number) => ({ text: `Image #${n}  `, color: undefined, dimColor: undefined })

const ROOT = '/tmp/claude-501'
const IMAGES = `${ROOT}/project/session-1/images`
const PNG = `${IMAGES}/1.png`
const END = { reason: 'other', sessionId: 'session-1', resume: { id: 'session-1' } } as const
const named = (n: number) => ({ text: `Image #${n}`, color: undefined, dimColor: undefined })
const picture = (columns: number, rows = 8, n = 1) => ({
  type: 'Image',
  props: { source: { file: `${IMAGES}/${n}.png`, format: 'png' }, rows, columns, alt: `Image #${n}` },
})

// The draft the prompt box holds, the cached picture behind it (its pixel size, or none yet), and the band beneath the mod's.
const world = (on: On, draft: string, picture: { width: number; height: number } | null = null) => {
  const box = { text: draft }
  const cache = { picture }
  const env: { tmpdir?: string } = {}
  const hold = { until: Promise.resolve() }
  const ran: string[][] = []
  const listed: string[] = []
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const [cmd] = e.argv
    const stdout =
      cmd === 'id'
        ? '501\n'
        : cmd === 'sips'
          ? `${PNG}\n  pixelWidth: ${cache.picture?.width}\n  pixelHeight: ${cache.picture?.height}\n`
          : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('env.get', () => ({ value: env.tmpdir }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.list', async (_, e) => {
    listed.push(e.path)
    await hold.until

    return { value: [entry('notes.txt', 'file'), entry('other', 'dir'), entry('project', 'dir')] }
  })
  on('fs.exists', (_, e) => ({ value: e.path.startsWith(`${IMAGES}/`) && cache.picture !== null }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'beneath' }))

  return { clock: mock.clock(on), box, cache, env, hold, ran, listed }
}

const drawn = async ($: Engine, props: Record<string, unknown> = {}) =>
  (await (await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props } })).findAll({ type: 'Text' })).map(
    ({ text, props }) => ({ text, color: props.color, dimColor: props.dimColor }),
  )

test('a marker in the draft draws its chip above what is beneath', async ($, on) => {
  const { clock } = world(on, 'look at [Image #1] please')

  await $.session.start(START)
  await clock.advance(500)

  expect(await drawn($)).toEqual([chip(1), BENEATH])
})

test('two markers draw two chips', async ($, on) => {
  const { clock } = world(on, '[Image #1] and [Image #2]')

  await $.session.start(START)
  await clock.advance(500)

  expect(await drawn($)).toEqual([chip(1), chip(2), BENEATH])
})

test('a marker leaving the draft removes its chip', async ($, on) => {
  const { clock, box } = world(on, '[Image #1] and [Image #2]')

  await $.session.start(START)
  await clock.advance(500)
  box.text = '[Image #2]'
  await clock.advance(500)

  expect(await drawn($)).toEqual([chip(2), BENEATH])
})

test('no marker draws only what is beneath', async ($, on) => {
  const { clock } = world(on, 'just words')

  await $.session.start(START)
  await clock.advance(500)

  expect(await drawn($)).toEqual([BENEATH])
})

test('a survey is left to the engine', async ($, on) => {
  const { clock } = world(on, '[Image #1]')

  await $.session.start(START)
  await clock.advance(500)

  expect(await drawn($, { hasSurvey: true })).toEqual([BENEATH])
})

const pictures = async ($: Engine, props: Record<string, unknown> = {}) =>
  (await (await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props } })).findAll({ type: 'Image' })).map(
    ({ type, props }) => ({ type, props }),
  )

const thumbnails = async ($: Engine) =>
  (await (await $.ui.mount(BAND)).findAll({ type: 'Box' }))
    .filter(({ props }) => props.marginRight === 2)
    .map(({ children }) => children.map(child => (child as { type: string }).type))

const ID = ['id', '-u']
const SIPS = ['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', PNG]

test('a pasted picture is drawn, named beneath it, above what is beneath', async ($, on) => {
  const { clock } = world(on, '[Image #1]', { width: 400, height: 400 })

  await $.session.start(START)
  await clock.advance(500)

  expect({ images: await pictures($), texts: await drawn($), thumbnails: await thumbnails($) }).toEqual({
    images: [picture(16)],
    texts: [named(1), BENEATH],
    thumbnails: [['Image', 'Text']],
  })
})

test('a short band caps the picture rows and the columns follow', async ($, on) => {
  const { clock } = world(on, '[Image #1]', { width: 400, height: 400 })

  await $.session.start(START)
  await clock.advance(500)

  expect(await pictures($, { maxRows: 5 })).toEqual([picture(8, 4)])
})

test('a wide picture is clamped to the band width and its rows follow', async ($, on) => {
  const { clock } = world(on, '[Image #1]', { width: 4000, height: 400 })

  await $.session.start(START)
  await clock.advance(500)

  expect(await pictures($)).toEqual([picture(78, 4)])
})

test('three pictures share the band width', async ($, on) => {
  const { clock } = world(on, '[Image #1] [Image #2] [Image #3]', { width: 1600, height: 900 })

  await $.session.start(START)
  await clock.advance(500)

  expect(await pictures($)).toEqual([picture(24, 7, 1), picture(24, 7, 2), picture(24, 7, 3)])
})

test('no cached file draws the chip and reads no size', async ($, on) => {
  const { clock, ran } = world(on, '[Image #1]')

  await $.session.start(START)
  await clock.advance(500)

  expect({ images: await pictures($), texts: await drawn($), ran }).toEqual({ images: [], texts: [chip(1), BENEATH], ran: [ID] })
})

test('a set CLAUDE_CODE_TMPDIR holds the claude-<uid> folder that is listed', async ($, on) => {
  const { clock, env, listed } = world(on, '[Image #1]')
  env.tmpdir = '/scratch'

  await $.session.start(START)
  await clock.advance(500)

  expect(listed).toEqual(['/scratch/claude-501'])
})

test('a poll that outlasts its period is not joined by a second', async ($, on) => {
  const { clock, hold, listed } = world(on, '[Image #1]')
  let release = () => {}
  hold.until = new Promise<void>(resolve => {
    release = resolve
  })

  await $.session.start(START)
  await clock.advance(500)
  await clock.advance(500)

  expect(listed).toEqual([ROOT])
  release()
})

test('a session that ends stops the lookups', async ($, on) => {
  const { clock, listed } = world(on, '[Image #1]')

  await $.session.start(START)
  await $.session.end(END)
  await clock.advance(500)

  expect(listed).toEqual([])
})

test('a /clear keeps the thumbnails coming', async ($, on) => {
  const { clock } = world(on, '[Image #1]')

  await $.session.start(START)
  await $.session.end({ ...END, reason: 'clear' })
  await clock.advance(500)

  expect(await drawn($)).toEqual([chip(1), BENEATH])
})

test('a file that appears on a later poll is then drawn', async ($, on) => {
  const { clock, cache } = world(on, '[Image #1]')

  await $.session.start(START)
  await clock.advance(500)
  cache.picture = { width: 400, height: 400 }
  await clock.advance(500)

  expect({ images: await pictures($), texts: await drawn($) }).toEqual({ images: [picture(16)], texts: [named(1), BENEATH] })
})

test('a marker with no file stops being looked up after ten polls', async ($, on) => {
  const { clock, listed } = world(on, '[Image #1]')

  await $.session.start(START)

  for (let poll = 0; poll < 12; poll++) {
    await clock.advance(500)
  }

  expect(listed).toEqual(Array(10).fill(ROOT))
})

test('a known marker is not fetched twice', async ($, on) => {
  const { clock, box, ran, listed } = world(on, '[Image #1]', { width: 400, height: 400 })

  await $.session.start(START)
  await clock.advance(500)
  box.text = '[Image #1] more'
  await clock.advance(500)
  await clock.advance(500)

  expect({ ran, listed }).toEqual({ ran: [ID, SIPS], listed: [ROOT] })
})
