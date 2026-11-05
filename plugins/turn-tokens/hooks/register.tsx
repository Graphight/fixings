import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Tokens } from '../types'

const turns = atom({ plugin: 'turn-tokens', key: 'turns' } as const, {} as Record<string, Tokens>)
const KEPT = 20
const MUTED = '#8a949c'

export const count = (n: number): string =>
  n < 1000 ? String(n) : n < 100_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`

export const tally = (tokens: Tokens): string => {
  const cached = tokens.cached === 0 ? '' : `  ·  ${count(tokens.cached)} cached`

  return `${count(tokens.in)} in  ·  ${count(tokens.out)} out${cached}`
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = e.usage ?? result.usage

    if (e.agentId !== undefined || usage === undefined) {
      return result
    }

    const tokens: Tokens = {
      in: usage.input_tokens,
      out: usage.output_tokens,
      cached: usage.cache_read_input_tokens,
    }

    await update($, turns, kept =>
      Object.fromEntries([...Object.entries(kept), [String(e.durationMs), tokens]].slice(-KEPT)),
    )

    return result
  })

  // The footer a skin draws carries the duration and the tool count, not the tokens;
  // this takes whatever was drawn and puts the turn's counts on the end of it.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const drawn = await next(e)
    const tokens = (await read($, turns))[String(e.props.durationMs)]

    if (tokens === undefined) {
      return drawn
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        {drawn}
        <Text color={MUTED}>{`  ·  ${tally(tokens)}`}</Text>
      </Box>
    )
  })
}
