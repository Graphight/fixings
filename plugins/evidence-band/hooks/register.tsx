import { atom, read, update } from 'claude-code'
import type { Color, Register } from 'claude-code'

import type { Evidence } from '../types'

const last = atom({ plugin: 'evidence-band', key: 'last' } as const, null)

// A test or build runner in command position: at the start, or after `&&`, `;`, `|`, `(` or a new line.
const RUNNER =
  /(?:^|&&|[;|(\n])\s*(?:\w+=\S+\s+)*(?:(?:time|env|npx|bunx|bash|sh|zsh|timeout\s+\S+)\s+)*(?:\S*\/)?(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|(?:go|cargo|dotnet|bazel|dbt|swift)\s+(?:test|build|check|vet|clippy)|claude\s+plugin\s+(?:test|validate)|python3?\s+-m\s+(?:pytest|unittest)|(?:jest|vitest|tsc|pytest|make|mvnw?|gradlew?|sbt|bats|rspec|ctest|test_\w+\.\w+)(?=\s|$))/

const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g
// A `&` that backgrounds, not the one in `&&`, `2>&1` or `&>`.
const BACKGROUNDED = '(?<![>&])&(?![&>])'
const MASKS = new RegExp(`[|;\\n]|${BACKGROUNDED}`)
const MASKS_UNDER_PIPEFAIL = new RegExp(`;|\\n|\\|\\||${BACKGROUNDED}`)

// The command with its quoted text emptied, so a runner or a separator inside a message is not read as one.
const bare = (command: string): string => command.replace(QUOTED, '""')

// The shell reports the status of the last command it ran, so a pipe, `;`, `||`, lone `&` or
// new line after the runner puts another command's status in place of the runner's.
export const isMasked = (command: string): boolean => {
  const text = bare(command)
  const found = RUNNER.exec(text)

  return (
    found !== null &&
    (/pipefail/.test(text) ? MASKS_UNDER_PIPEFAIL : MASKS).test(text.slice(found.index + found[0].length))
  )
}

const verdict = ({ code, isMasked }: Evidence): { color: Color; text: string } =>
  code === null
    ? { color: 'warning', text: '? no exit status' }
    : isMasked
      ? { color: 'warning', text: `? exit ${code}, maybe a later command's` }
      : code === 0
        ? { color: 'success', text: '✓ exit 0' }
        : { color: 'error', text: `✗ exit ${code}` }

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const command = e.command.trim()

    if (e.agentId !== undefined || !RUNNER.test(bare(command)) || ran.deny !== undefined) {
      return ran
    }

    // A failed call carries no status field: the text the model reads starts `Exit code N`.
    const failed = /^Exit code (\d+)/.exec(ran.text ?? '')?.[1]
    const code = ran.isError
      ? failed === undefined
        ? null
        : Number(failed)
      : ran.result.backgroundTaskId === undefined && ran.result.returnCodeInterpretation === undefined
        ? 0
        : null

    await update($, last, () => ({ command: command.replace(/\s+/g, ' '), code, isMasked: isMasked(command) }))

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const seen = await read($, last)

    if (e.props.hasSurvey || seen === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { color, text } = verdict(seen)

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={color}>{text}</Text>
          <Text color="subtle" wrap="truncate-end">{`  ·  ${seen.command}`}</Text>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
