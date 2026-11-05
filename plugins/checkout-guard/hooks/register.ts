import type { EngineInterface, Register, Timer } from 'claude-code'

type Entry = { branch: string; at: number }

const BEAT_MS = 30_000
const STALE_MS = 90_000
const GIT = String.raw`\bgit(?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+`
const COMMIT = new RegExp(`${GIT}commit\\b`)
const SWITCH = new RegExp(`${GIT}(?:switch|checkout)\\b`)
const PR_CHECKOUT = /\bgh\s+pr\s+checkout\b/
const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g
const SEPARATOR = /[;&|\n]+/
const PATHS = /\s--\s+\S/
// a -C directory only the shell can resolve; spawning git in it fails with ENOENT
const SHELL_EXPANDED = /^~|[$`]/

let root: string | null = null
let key: string | null = null
let beating: Timer | null = null
let expected: string | null = null
let nudge: string | null = null

const checkout = async ($: EngineInterface, dir?: string): Promise<{ root: string; branch: string } | null> => {
  const git = await $.process.run(['git', 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], dir ? { cwd: dir } : undefined)
  const [root, branch] = git.stdout.trim().split('\n')

  return git.exitCode === 0 && root && branch ? { root, branch } : null
}

const others = async ($: EngineInterface): Promise<Entry[]> => {
  if (root === null) {
    return []
  }

  const prefix = `${root}::`
  const now = await $.clock.now()
  const live: Entry[] = []

  for (const name of await $.store.keys()) {
    if (!name.startsWith(prefix) || name === key) {
      continue
    }

    const entry = (await $.store.get(name)) as Entry | undefined

    if (entry && now - entry.at <= STALE_MS) {
      live.push(entry)
    } else {
      await $.store.delete(name)
    }
  }

  return live
}

const beat = async ($: EngineInterface): Promise<Entry[]> => {
  const found = await checkout($, await $.session.root())
  const next = found && `${found.root}::${await $.session.id()}`

  if (key !== null && key !== next) {
    await $.store.delete(key)
  }

  if (found?.root !== root) {
    expected = found?.branch ?? null
  }

  root = found?.root ?? null
  key = next

  if (found && next) {
    await $.store.set(next, { branch: expected ?? found.branch, at: await $.clock.now() } satisfies Entry)
  }

  const live = await others($)

  $.ui.status(live.length > 0 ? `${live.length} other session${live.length > 1 ? 's' : ''} in this checkout` : undefined)

  return live
}

const crowd = (live: Entry[]): string =>
  `${live.length} other session${live.length > 1 ? 's are' : ' is'} in this checkout (on ${live.map(entry => entry.branch).join(', ')})`

// each command of a compound one, its quoted text emptied so a message that names a git verb is not read as one
const parts = (command: string): string[] => command.replace(QUOTED, '""').split(SEPARATOR)

const isCommit = (command: string): boolean => parts(command).some(part => COMMIT.test(part))

const switches = (command: string): string[] =>
  parts(command).filter(part => PR_CHECKOUT.test(part) || (SWITCH.test(part) && !PATHS.test(part)))

const isSwitch = (command: string): boolean => switches(command).length > 0

const names = (command: string, branch: string): boolean =>
  switches(command).some(part => part.split(/\s+/).includes(branch))

const here = ($: EngineInterface) =>
  $.session
    .root()
    .then(dir => checkout($, dir))
    .catch(() => null)

const target = (command: string): string | undefined => {
  const dirs = [...((COMMIT.exec(command) ?? SWITCH.exec(command))?.[0].matchAll(/\s-C\s+(\S+)/g) ?? [])]
    .map(([, dir = '']) => dir.replace(/^(['"])(.*)\1$/, '$2'))
    .filter(dir => !SHELL_EXPANDED.test(dir))

  return dirs.at(-1)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const before = await here($)
    const ran = await next(e)
    const after = await here($)

    if (ran.deny || !before || !after) {
      return ran
    }

    // the session's own move, or a switch that names the branch HEAD is already on, which confirms a move made elsewhere
    const isOwn =
      before.branch === expected ||
      (isSwitch(e.command) && after.branch !== before.branch) ||
      names(e.command, after.branch)

    if (isOwn) {
      expected = after.branch
    }

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const committing = isCommit(e.command)
    const switching = isSwitch(e.command)

    if (!committing && !switching) {
      return next(e)
    }

    const live = await beat($)
    const there = await checkout($, target(e.command) ?? (e.agentId ? await $.session.cwd() : undefined))

    if (root === null || !there || there.root !== root) {
      return next(e)
    }

    if (switching && live.length > 0) {
      return {
        deny: `checkout-guard: ${crowd(live)}; a switch would move HEAD under ${live.length > 1 ? 'them' : 'it'}. Use \`git worktree add\` or start with \`claude -w\`; to restore a file use \`git restore\`.`,
      }
    }

    if (!committing || expected === null || there.branch === expected) {
      return next(e)
    }

    return {
      deny: `checkout-guard: this session is on ${expected}, but HEAD is on ${there.branch}. Another session or process moved HEAD. Stop and tell the person; if they moved it on purpose, \`git switch ${there.branch}\` sets this session's branch to it.`,
    }
  }).catch(($, e, next) =>
    next.called
      ? next(e)
      : {
          deny: `checkout-guard: the guard failed before it could judge this command, so the command was not run (${[next.error.kind, next.error.message].filter(Boolean).join(': ')}).`,
        },
  )

  on('session.start', async ($, e, next) => {
    const live = await beat($)

    // a resumed session already worked here; moving it would leave its own edits behind
    if (e.isInteractive && live.length > 0 && (await $.session.turns()) === 0) {
      $.ui.toast(`${crowd(live)}; Claude moves to a worktree before its first edit`)
      nudge = `checkout-guard: ${crowd(live)}. Before your first edit or commit, call EnterWorktree to move into your own worktree, branched from origin's default branch. If the person names another base, run \`git worktree add .claude/worktrees/<name> -b <branch> <base>\` and enter it with EnterWorktree's \`path\`. A read-only prompt needs no move. If the person says to stay, stay and do not raise it again.`
    }

    beating ??= $.clock.every(BEAT_MS, () => void beat($))

    return next(e)
  })

  // a slash command may never reach the model, so the nudge waits for a typed prompt
  on('prompt.submit', ($, e, next) => {
    const held = nudge

    if (held === null || e.command) {
      return next(e)
    }

    nudge = null

    return next({ ...e, context: [...(e.context ?? []), held] })
  })

  // after a /clear or a resume the process goes on under a new session id and no session.start fires
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      return next(e)
    }

    beating?.cancel()
    beating = null

    if (key !== null) {
      await $.store.delete(key)
      key = null
    }

    return next(e)
  })
}
