import type { EngineInterface, Register, RenderElement, RenderNode } from 'claude-code'

type Match = { start: number; end: number; label: string; href: string }
type Ctx = { repo: string | null; jiraUrl: string; projects: string[] }

const REMOTE = /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/
const slug = (remote?: string | null) => (remote && REMOTE.exec(remote)?.[1]) || null

// Spans left as written, then the references; the skips come first so they win at the same spot.
const SKIP = String.raw`(?:\x60{3}[\s\S]*?(?:\x60{3}|$)|~{3}[\s\S]*?(?:~{3}|$)|\x60[^\x60\n]*\x60|\[[^\]\n]*\]\([^)\n]*\)|<[^>\s]+>)`
const SLUG = String.raw`(?<![\w/.-])(?<slug>[\w.-]+\/[\w.-]+)#(?<slugN>\d+)(?!\w)`
const BARE = String.raw`(?<![\w&])#(?<n>\d+)(?!\w)`
const URL = String.raw`(?<![\w/])https:\/\/github\.com\/[\w.-]+\/(?<name>[\w.-]+)\/(?:pull|issues)\/(?<urlN>\d+)(?![\w/#?])`
// Any other URL is matched only to be left whole; it comes after URL so a GitHub link still wins at the same spot.
const ANY_URL = String.raw`https?:\/\/[^\s<>]+`
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const refs = ({ jiraUrl, projects }: Ctx) => {
  const keys = jiraUrl && projects.length ? `|(?<![\\w-])(?<project>${projects.map(escape).join('|')})-(?<key>\\d+)(?!\\w)` : ''

  return new RegExp(`${SKIP}|${SLUG}|${BARE}${keys}|${URL}|${ANY_URL}`, 'g')
}

const find = (text: string, ctx: Ctx): Match[] =>
  [...text.matchAll(refs(ctx))].flatMap(({ 0: label, index: start = 0, groups = {} }) => {
    const { slug, slugN, n, project, key, name, urlN } = groups
    const end = start + label.length

    if (name !== undefined) {
      return [{ start, end, label: `${name}#${urlN}`, href: label }]
    }

    if (project !== undefined) {
      return [{ start, end, label, href: `${ctx.jiraUrl}/browse/${project}-${key}` }]
    }

    if (slug !== undefined) {
      return [{ start, end, label, href: `https://github.com/${slug}/issues/${slugN}` }]
    }

    return n !== undefined && ctx.repo !== null ? [{ start, end, label, href: `https://github.com/${ctx.repo}/issues/${n}` }] : []
  })

const link = (text: string, ctx: Ctx) =>
  find(text, ctx).reduceRight((out, { start, end, label, href }) => `${out.slice(0, start)}[${label}](${href})${out.slice(end)}`, text)

type Parent = RenderElement & { children: RenderNode[] }

const TYPED = new Set(['composer', 'bridge', 'sdk'])

const hasChildren = (node: RenderNode): node is Parent => typeof node !== 'string' && 'children' in node && node.children !== undefined

const split = (text: string, ctx: Ctx): RenderNode[] => {
  const parts: RenderNode[] = []
  let at = 0

  for (const { start, end, label, href } of find(text, ctx)) {
    parts.push(text.slice(at, start), { type: 'Link', props: { href }, children: [label] } as RenderNode)
    at = end
  }

  return [...parts, text.slice(at)].filter(part => part !== '')
}

const linkText = (node: RenderNode, ctx: Ctx): RenderNode => {
  if (typeof node === 'string' || !hasChildren(node)) {
    return node
  }

  const children = node.children.flatMap(child => (node.type === 'Text' && typeof child === 'string' ? split(child, ctx) : [linkText(child, ctx)]))

  return { ...node, children } as RenderNode
}

const upstreams = new Map<string, Promise<string | null>>()

// A fork's issues and PRs live in its upstream, so a GitHub `upstream` remote wins over `origin`.
const sessionRepo = async ($: EngineInterface): Promise<string | null> => {
  const repo = await $.session.repo()

  if (repo === null) {
    return null
  }

  if (!upstreams.has(repo.root)) {
    const run = $.process.run(['git', 'remote', 'get-url', 'upstream'], { cwd: repo.root })

    upstreams.set(repo.root, run.then(({ exitCode, stdout }) => (exitCode === 0 ? slug(stdout.trim()) : null), () => null))
  }

  return (await upstreams.get(repo.root)) ?? slug(repo.remote)
}

export const register: Register = (on, options) => {
  const { jiraUrl = '', projects = '' } = options as Record<string, string>
  const base = { jiraUrl: jiraUrl.replace(/\/+$/, ''), projects: projects.split(',').map(p => p.trim()).filter(Boolean) }
  const ctx = (repo: string | null): Ctx => ({ ...base, repo })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, text: link(e.props.text, ctx(await sessionRepo($))) } }),
  )

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const drawn = await next(e)

    return TYPED.has(e.props.origin.kind) ? (linkText(drawn, ctx(await sessionRepo($))) as RenderElement) : drawn
  })
}
