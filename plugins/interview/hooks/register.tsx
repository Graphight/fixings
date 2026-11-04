import type { Register } from 'claude-code'

// The tag the interview skill puts in an AskUserQuestion call's metadata.source.
const TAG = /^interview:(\d+)\/(\d+):(.*)$/

export const register: Register = on => {
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const tag = TAG.exec(e.props.metadataSource ?? '')

    if (tag === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const n = Number(tag[1])
    // An answer can add rounds before the count catches up, so the dots never show fewer than the round.
    const of = Math.max(n, Number(tag[2]))

    return (
      <Box flexDirection="column">
        <Box>
          <Text color="subtle" wrap="truncate-end">{`Interview · round ${n} of ~${of} · ${tag[3]}  `}</Text>
          <Text color="suggestion">{'●'.repeat(n)}</Text>
          <Text color="subtle">{'○'.repeat(of - n)}</Text>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
