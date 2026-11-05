import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/src/widgets', surface: 'terminal', isInteractive: true } as const
const END = { reason: 'other', sessionId: 's1', resume: { id: 's1' } } as const
const ROOT = '/src/widgets'

const world = (on: On, entries: Record<string, unknown> = {}, isRepo = true) => {
  const head = { id: 's1', branch: 'main', root: ROOT, turns: 0, throws: false, cwd: null as string | null, switchesTo: null as string | null }
  const kept = new Map(Object.entries(entries))
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('session.turns', () => ({ value: head.turns }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    kept.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('session.id', () => ({ value: head.id }))
  on('session.root', () => ({ value: head.root }))
  on('session.cwd', () => ({ value: head.cwd ?? head.root }))
  on('process.run', (_, e) => {
    if (head.throws) {
      throw new Error('git is unavailable')
    }

    const stdout = !isRepo
      ? ''
      : e.init?.cwd && e.init.cwd !== head.root
        ? `${e.init.cwd}\nother\n`
        : `${head.root}\n${head.branch}\n`

    return {
      value: { exitCode: isRepo ? 0 : 128, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('tool.call', () => {
    head.branch = head.switchesTo ?? head.branch

    return { result: 'ok' }
  })

  return { clock: mock.clock(on, { now: 1_000_000 }), kept, head, statuses, toasts }
}

const contents = (kept: Map<string, unknown>) => Object.fromEntries(kept)

test('registers the session under its checkout at start', async ($, on) => {
  const { kept } = world(on)

  await $.session.start(START)

  expect(contents(kept)).toEqual({ [`${ROOT}::s1`]: { branch: 'main', at: 1_000_000 } })
})

test('the timer rewrites the time', async ($, on) => {
  const { clock, kept } = world(on)

  await $.session.start(START)
  await clock.advance(30_000)

  expect(contents(kept)).toEqual({ [`${ROOT}::s1`]: { branch: 'main', at: 1_030_000 } })
})

test('session end deletes the entry and stops the timer', async ($, on) => {
  const { clock, kept } = world(on)

  await $.session.start(START)
  await $.session.end(END)
  await clock.advance(60_000)

  expect(contents(kept)).toEqual({})
})

test('a clear keeps the heartbeat and moves the entry to the new session id', async ($, on) => {
  const { clock, head, kept } = world(on)

  await $.session.start(START)
  await $.session.end({ ...END, reason: 'clear' })
  head.id = 's2'
  await clock.advance(30_000)

  expect(contents(kept)).toEqual({ [`${ROOT}::s2`]: { branch: 'main', at: 1_030_000 } })
})

test('registers nothing outside a git repository', async ($, on) => {
  const { kept } = world(on, {}, false)

  await $.session.start(START)

  expect(contents(kept)).toEqual({})
})

const COMMIT = 'git commit -m work'

const moved = (branch: string) => ({
  deny: `checkout-guard: this session is on main, but HEAD is on ${branch}. Another session or process moved HEAD. Stop and tell the person; if they moved it on purpose, \`git switch ${branch}\` sets this session's branch to it.`,
})

test('a commit passes on the session branch', async ($, on) => {
  world(on)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
})

test('a commit is denied after HEAD moved between two calls', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'true' })
  head.branch = 'feature'

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual(moved('feature'))
})

test('a commit is denied on a HEAD moved from outside after a resume', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  await $.session.end({ ...END, reason: 'resume' })
  head.id = 's2'
  head.branch = 'feature'

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual(moved('feature'))
})

test('a commit passes after the session\'s own command moved HEAD', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.switchesTo = 'feature'
  await $.tool.call({ tool: 'Bash', command: 'git switch feature' })

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
})

test('a commit in another checkout passes', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.branch = 'feature'

  expect(await $.tool.call({ tool: 'Bash', command: 'git -C /src/other commit -m work' })).toEqual({ result: 'ok' })
})

test('a commit through a -C shell variable is judged against the session checkout', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'true' })
  head.branch = 'feature'

  expect(await $.tool.call({ tool: 'Bash', command: 'R=/src/widgets; git -C $R commit -m work' })).toEqual(moved('feature'))
})

test('a commit is denied when the guard git call throws', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.throws = true

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({
    deny: 'checkout-guard: the guard failed before it could judge this command, so the command was not run (throw: no implementation for process.run).',
  })
})

test('a command that is not a commit passes when git fails', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.throws = true

  expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toEqual({ result: 'ok' })
})

const LIVE = { [`${ROOT}::s2`]: { branch: 'feature', at: 1_000_000 } }
const TWO = { ...LIVE, [`${ROOT}::s3`]: { branch: 'fix', at: 1_000_000 } }
const SWITCH = 'git switch -c probe'
const BUSY = {
    deny: 'checkout-guard: 1 other session is in this checkout (on feature); a switch would move HEAD under it. Use `git worktree add` or start with `claude -w`; to restore a file use `git restore`.',
  }

test('a switch is denied while another session is live', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: SWITCH })).toEqual(BUSY)
})

test('a switch is denied naming every other session', async ($, on) => {
  world(on, TWO)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: SWITCH })).toEqual({
    deny: 'checkout-guard: 2 other sessions are in this checkout (on feature, fix); a switch would move HEAD under them. Use `git worktree add` or start with `claude -w`; to restore a file use `git restore`.',
  })
})

test('a switch passes when no other session is live', async ($, on) => {
  world(on)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: SWITCH })).toEqual({ result: 'ok' })
})

test('a switch passes when the other entry is stale, and deletes it', async ($, on) => {
  const { kept } = world(on, { [`${ROOT}::s2`]: { branch: 'feature', at: 900_000 } })

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: SWITCH })).toEqual({ result: 'ok' })
  expect(contents(kept)).toEqual({ [`${ROOT}::s1`]: { branch: 'main', at: 1_000_000 } })
})

test('a switch passes when the other entry is under another checkout', async ($, on) => {
  world(on, { '/src/other::s2': { branch: 'feature', at: 1_000_000 } })

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: SWITCH })).toEqual({ result: 'ok' })
})

test('restoring a file passes while another session is live', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: 'git checkout -- file.txt' })).toEqual({ result: 'ok' })
})

test('a switch chained before a command with a path separator is denied', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: 'git switch main && git log --oneline -- README.md' })).toEqual(BUSY)
})

test('a commit whose message names git switch passes while another session is live', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: 'git commit -m "docs: explain git switch"' })).toEqual({ result: 'ok' })
})

test('gh pr checkout is denied while another session is live', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: 'gh pr checkout 12' })).toEqual(BUSY)
})

test('a commit passes after the session\'s own allowed switch, even when HEAD had been moved', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.branch = 'feature'
  head.switchesTo = 'topic'
  await $.tool.call({ tool: 'Bash', command: 'git switch topic' })

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
})

test('a commit is denied after a checkout of a file left a moved HEAD where it was', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.branch = 'feature'
  await $.tool.call({ tool: 'Bash', command: 'git checkout README.md' })

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual(moved('feature'))
})

test('a commit passes after a switch that names the branch a moved HEAD is on', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.branch = 'feature'
  await $.tool.call({ tool: 'Bash', command: 'git switch feature' })

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
})

test('a commit passes after the session root changed to a worktree on another branch', async ($, on) => {
  const { head, kept } = world(on)

  await $.session.start(START)
  head.root = '/src/widgets-wt'
  head.branch = 'feature'

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
  expect(contents(kept)).toEqual({ '/src/widgets-wt::s1': { branch: 'feature', at: 1_000_000 } })
})

test('a worktree sub-agent switch leaves the main loop commit alone', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.cwd = '/src/widgets-wt'
  await $.tool.call({ tool: 'Bash', command: 'git switch other', agentId: 'a1' })

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT })).toEqual({ result: 'ok' })
})

test('the status line counts one other live session at start', async ($, on) => {
  const { statuses } = world(on, LIVE)

  await $.session.start(START)

  expect(statuses).toEqual(['1 other session in this checkout'])
})

test('the status line counts two other sessions in the plural', async ($, on) => {
  const { statuses } = world(on, TWO)

  await $.session.start(START)

  expect(statuses).toEqual(['2 other sessions in this checkout'])
})

test('the status line is cleared when the other entry goes stale', async ($, on) => {
  const { clock, statuses } = world(on, LIVE)

  await $.session.start(START)
  await clock.advance(120_000)

  expect(statuses).toEqual([
    '1 other session in this checkout',
    '1 other session in this checkout',
    '1 other session in this checkout',
    '1 other session in this checkout',
    undefined,
  ])
})

test('the status line stays clear outside a git repository', async ($, on) => {
  const { statuses } = world(on, LIVE, false)

  await $.session.start(START)

  expect(statuses).toEqual([undefined])
})

test('a session that joins a live checkout is nudged on its first prompt only, with a toast', async ($, on) => {
  const { toasts } = world(on, LIVE)

  await $.session.start(START)
  const first = await $.prompt.submit({ text: 'hello' })
  const second = await $.prompt.submit({ text: 'again' })

  expect({ toasts, first: first.context, second: second.context }).toEqual({
    toasts: ['1 other session is in this checkout (on feature); Claude moves to a worktree before its first edit'],
    first: [expect.stringContaining('call EnterWorktree')],
    second: undefined,
  })
})

test('a slash command leaves the nudge for the first typed prompt', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)
  const command = await $.prompt.submit({ text: '/model', command: { name: 'model', args: '' } })
  const typed = await $.prompt.submit({ text: 'hello' })

  expect({ command: command.context, typed: typed.context }).toEqual({
    command: undefined,
    typed: [expect.stringContaining('call EnterWorktree')],
  })
})

test('a session alone in its checkout is not nudged', async ($, on) => {
  const { toasts } = world(on)

  await $.session.start(START)

  expect({ toasts, context: (await $.prompt.submit({ text: 'hello' })).context }).toEqual({ toasts: [], context: undefined })
})

test('a session that is not interactive is not nudged', async ($, on) => {
  const { toasts } = world(on, LIVE)

  await $.session.start({ ...START, isInteractive: false })

  expect({ toasts, context: (await $.prompt.submit({ text: 'hello' })).context }).toEqual({ toasts: [], context: undefined })
})

test('a resumed session in a live checkout is not nudged', async ($, on) => {
  const { head, toasts } = world(on, LIVE)
  head.turns = 3

  await $.session.start(START)

  expect({ toasts, context: (await $.prompt.submit({ text: 'hello' })).context }).toEqual({ toasts: [], context: undefined })
})

test('a sub-agent in its own worktree passes a switch while another session is live', async ($, on) => {
  const { head } = world(on, LIVE)

  await $.session.start(START)
  head.cwd = '/src/widgets-wt'

  expect(await $.tool.call({ tool: 'Bash', command: 'git switch other', agentId: 'a1' })).toEqual({ result: 'ok' })
})

test('a sub-agent in the shared checkout is denied a switch while another session is live', async ($, on) => {
  world(on, LIVE)

  await $.session.start(START)

  expect(await $.tool.call({ tool: 'Bash', command: 'git switch other', agentId: 'a1' })).toMatchObject({
    deny: expect.stringContaining('1 other session is in this checkout'),
  })
})

test('a sub-agent commit in its own worktree passes after HEAD moved in the shared checkout', async ($, on) => {
  const { head } = world(on)

  await $.session.start(START)
  head.branch = 'moved'
  head.cwd = '/src/widgets-wt'

  expect(await $.tool.call({ tool: 'Bash', command: COMMIT, agentId: 'a1' })).toEqual({ result: 'ok' })
})
