import type { Register, RenderElement, RenderNode } from 'claude-code'

// The plugin options' colours, set once per activation by register.
let BORDER: string
let BG: string

type Props = Record<string, string | number | boolean>
type Parent = RenderElement & { children: RenderNode[] }
type Styled = Parent & { props: Props }

const hasChildren = (node: RenderNode): node is Parent => typeof node !== 'string' && 'children' in node && node.children !== undefined

// The skin keys each block's copy control `copy-<n>…`; `copy-reply` takes the whole reply.
const isBlockCopy = (node: RenderNode): boolean =>
  typeof node !== 'string' && node.type === 'Button' && node.props.key.startsWith('copy-') && node.props.key !== 'copy-reply'

const holdsBlockCopy = (node: RenderNode): boolean => isBlockCopy(node) || (hasChildren(node) && node.children.some(holdsBlockCopy))

// The Box the skin lays over the right end of a frame's top border, holding the block's controls.
const isControls = (node: RenderNode): node is Styled =>
  hasChildren(node) && node.type === 'Box' && node.props?.position === 'absolute' && node.props.top === -1 && holdsBlockCopy(node)

// A fence the skin left to Claude Code's own drawing: one with no language tag, or a tag it does not know.
const FENCE = /^\s*(?:```|~~~).*\n([\s\S]*)\n\s*(?:```|~~~)\s*$/
const codeOf = (node: RenderNode): string | undefined =>
  typeof node !== 'string' && node.type === 'Markdown' ? FENCE.exec(node.props.text)?.[1] : undefined

// The frame's background behind every Text in it that has none of its own.
const shade = (node: RenderNode): RenderNode => {
  if (typeof node === 'string') {
    return node
  }

  const shaded = node.type === 'Text' ? { ...node, props: { backgroundColor: BG, ...node.props } } : node

  return hasChildren(shaded) ? ({ ...shaded, children: shaded.children.map(shade) } as RenderNode) : shaded
}

const frame = (props: Props, children: RenderNode[]): RenderNode =>
  shade({ type: 'Box', props: { ...props, borderColor: BORDER, backgroundColor: BG }, children } as RenderNode)

// Every block with a copy button in a tinted frame, the button its first row.
const lit = (node: RenderNode): RenderNode => {
  if (typeof node === 'string') {
    return node
  }

  if (node.type === 'Button' && isBlockCopy(node)) {
    const { dimColor, ...props } = node.props

    return { ...node, props, children: [{ type: 'Text', props: { color: BORDER, weight: 'semibold' }, children: [node.props.label.trim()] }] }
  }

  if (!hasChildren(node)) {
    return node
  }

  const code = node.children.map(codeOf).find(found => found !== undefined)

  if (code !== undefined && node.children.some(holdsBlockCopy)) {
    const rows = node.children.filter(holdsBlockCopy).map(row => lit({ ...(row as Parent), props: {} } as RenderNode))
    const lines = code.replace(/\t/g, '  ').split('\n').map(line => ({ type: 'Text', children: [line === '' ? ' ' : line] }) as RenderNode)

    return {
      type: 'Box',
      props: { flexDirection: 'column', marginY: 1 },
      children: [frame({ flexDirection: 'column', borderStyle: 'round', paddingX: 1 }, [...rows, ...lines])],
    }
  }

  const rows = node.children.filter(isControls).map(({ props: { position, top, right, ...props }, ...controls }) => ({ ...controls, props }) as Styled)
  const children = [...rows, ...node.children.filter(child => !isControls(child))].map(lit)

  return rows.length === 0 ? ({ ...node, children } as RenderNode) : frame((node as Styled).props, children)
}

export const register: Register = (on, options) => {
  ;({ border: BORDER, background: BG } = options as Record<string, string>)

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => lit(await next(e)) as RenderElement)
}
