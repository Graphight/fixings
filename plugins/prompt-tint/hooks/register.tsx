import type { Register } from 'claude-code'

const TYPED = new Set(['composer', 'bridge', 'sdk'])
const MAX = 4000

export const register: Register = (on, options) => {
  const { border, background, text } = options as Record<string, string>

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!TYPED.has(e.props.origin.kind) || e.props.text === '' || e.props.text.length > MAX) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="flex-start" marginY={1}>
        <Box borderStyle="round" borderColor={border} backgroundColor={background} paddingX={1} flexShrink={1}>
          <Text color={text} backgroundColor={background}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
