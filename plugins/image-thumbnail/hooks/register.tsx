import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Attached } from '../types'

const images = atom({ plugin: 'image-thumbnail', key: 'images' } as const, [] as Attached[])

const POLL_MS = 500
const THUMB_ROWS = 8
const MAX_LOOKUPS = 10

let polling: Timer | null = null
let isPolling = false
let root: string | undefined
const lookups = new Map<number, number>()

const cacheRoot = async ($: EngineInterface) =>
  (root ??= `${(await $.env.get('CLAUDE_CODE_TMPDIR')) ?? '/tmp'}/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`)

const cached = async ($: EngineInterface, n: number) => {
  const base = await cacheRoot($)
  const session = await $.session.id()

  for (const { name, kind } of await $.fs.list(base)) {
    const file = `${base}/${name}/${session}/images/${n}.png`

    if (kind === 'dir' && (await $.fs.exists(file))) {
      return file
    }
  }
}

const grab = async ($: EngineInterface, n: number): Promise<Attached> => {
  try {
    const file = await cached($, n)

    if (file === undefined) {
      return { n }
    }

    const { stdout } = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', file])
    const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1])
    const height = Number(/pixelHeight: (\d+)/.exec(stdout)?.[1])

    return width > 0 && height > 0 ? { n, file, width, height } : { n }
  } catch {
    return { n }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    polling ??= $.clock.every(POLL_MS, async () => {
      // a lookup can outlast a period, and a second poll beside it would look the same marker up twice
      if (isPolling) {
        return
      }

      isPolling = true

      try {
        const { text } = await $.prompt.read()
        const found = [...text.matchAll(/\[Image #(\d+)\]/g)].map(([, n = '']) => Number(n))
        const seen = await read($, images)
        const attached: Attached[] = []

        for (const n of found) {
          const known = seen.find(a => a.n === n)
          const tries = lookups.get(n) ?? 0

          if (known?.file !== undefined || tries >= MAX_LOOKUPS) {
            attached.push(known ?? { n })
          } else {
            lookups.set(n, tries + 1)
            attached.push(await grab($, n))
          }
        }

        for (const n of lookups.keys()) {
          if (!found.includes(n)) {
            lookups.delete(n)
          }
        }

        if (JSON.stringify(attached) !== JSON.stringify(seen)) {
          await update($, images, () => attached)
        }
      } finally {
        isPolling = false
      }
    })

    return next(e)
  })

  // after a /clear or a resume the process goes on under a new session id and no session.start fires
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      polling?.cancel()
      polling = null
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const attached = await read($, images)

    if (e.props.hasSurvey || attached.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const Image = e.surface === 'terminal' ? $.ui.resolve(e).Image : undefined
    const { bodyColumns, maxRows } = e.props
    const tallest = Math.max(1, Math.min(THUMB_ROWS, maxRows - 1))
    const widest = Math.max(1, Math.floor(bodyColumns / attached.length) - 2)

    return (
      <Box flexDirection="column">
        <Box>
          {attached.map(({ n, file, width, height }) => {
            if (Image === undefined || file === undefined || width === undefined || height === undefined) {
              return <Text key={n}>{`Image #${n}  `}</Text>
            }

            const columns = Math.min(widest, Math.max(1, Math.round((tallest * 2 * width) / height)))
            const rows = Math.max(1, Math.min(tallest, Math.round((columns * height) / (2 * width))))

            return (
              <Box key={n} flexDirection="column" marginRight={2}>
                <Image source={{ file, format: 'png' }} rows={rows} columns={columns} alt={`Image #${n}`} />
                <Text>{`Image #${n}`}</Text>
              </Box>
            )
          })}
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
