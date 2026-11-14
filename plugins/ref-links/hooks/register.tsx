import type { Register } from 'claude-code'

type Match = { start: number; end: number; label: string; href: string }
type Ctx = { repo: string | null; jiraUrl: string; projects: string[] }

const REMOTE = /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/

// Spans left as written, then the references; the skips come first so they win at the same spot.
const SKIP = String.raw`(?:\x60{3}[\s\S]*?(?:\x60{3}|$)|~{3}[\s\S]*?(?:~{3}|$)|\x60[^\x60\n]*\x60|\[[^\]\n]*\]\([^)\n]*\)|<[^>\s]+>)`
const SLUG = String.raw`(?<![\w/.-])([\w.-]+\/[\w.-]+)#(\d+)(?!\w)`
const BARE = String.raw`(?<![\w&])#(\d+)(?!\w)`
const URL = String.raw`(?<![\w/])https:\/\/github\.com\/[\w.-]+\/(?<name>[\w.-]+)\/(?:pull|issues)\/(?<n>\d+)(?!\w)`
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const refs = ({ jiraUrl, projects }: Ctx) => {
  const keys = jiraUrl && projects.length ? `|(?<![\\w-])(${projects.map(escape).join('|')})-(\\d+)(?!\\w)` : ''

  return new RegExp(`${SKIP}|${SLUG}|${BARE}${keys}|${URL}`, 'g')
}

export const find = (text: string, ctx: Ctx): Match[] =>
  [...text.matchAll(refs(ctx))].flatMap(({ 0: label, 1: slug, 2: slugNumber, 3: number, 4: project, 5: key, index: start = 0, groups }) => {
    const { repo, jiraUrl } = ctx
    const end = start + label.length

    if (groups?.name !== undefined) {
      return [{ start, end, label: `${groups.name}#${groups.n}`, href: label }]
    }

    if (project !== undefined) {
      return [{ start, end, label, href: `${jiraUrl.replace(/\/+$/, '')}/browse/${project}-${key}` }]
    }

    if (slug !== undefined) {
      return [{ start, end, label, href: `https://github.com/${slug}/issues/${slugNumber}` }]
    }

    return number !== undefined && repo !== null ? [{ start, end, label, href: `https://github.com/${repo}/issues/${number}` }] : []
  })

const link = (text: string, ctx: Ctx) =>
  find(text, ctx).reduceRight((out, { start, end, label, href }) => `${out.slice(0, start)}[${label}](${href})${out.slice(end)}`, text)

export const register: Register = (on, options) => {
  const { jiraUrl = '', projects = '' } = options as Record<string, string>
  const keys = projects.split(',').map(p => p.trim()).filter(Boolean)

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const remote = (await $.session.repo())?.remote
    const repo = (remote && REMOTE.exec(remote)?.[1]) || null

    return next({ ...e, props: { ...e.props, text: link(e.props.text, { repo, jiraUrl, projects: keys }) } })
  })
}
