import type { Register } from 'claude-code'

// A step up from the warm-burnout terminal background, so a prompt reads as a
// shaded block rather than one more bordered card in the transcript.
const BG = '#241a12'
const BORDER = '#ff8f40'
const FG = '#d8d4cc'
const TYPED = new Set(['composer', 'bridge', 'sdk'])
const MAX = 4000

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!TYPED.has(e.props.origin.kind) || e.props.text === '' || e.props.text.length > MAX) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="flex-start" marginY={1}>
        <Box borderStyle="round" borderColor={BORDER} backgroundColor={BG} paddingX={1} flexShrink={1}>
          <Text color={FG} backgroundColor={BG}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
