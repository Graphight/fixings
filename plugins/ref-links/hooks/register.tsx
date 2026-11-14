import type { Register } from 'claude-code'

type Match = { start: number; end: number; label: string; href: string }
type Ctx = { repo: string | null }

const REMOTE = /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/

// Spans left as written, then the references; the skips come first so they win at the same spot.
const SKIP = String.raw`(?:\x60{3}[\s\S]*?(?:\x60{3}|$)|~{3}[\s\S]*?(?:~{3}|$)|\x60[^\x60\n]*\x60|\[[^\]\n]*\]\([^)\n]*\)|<[^>\s]+>)`
const SLUG = String.raw`(?<![\w/.-])([\w.-]+\/[\w.-]+)#(\d+)(?!\w)`
const BARE = String.raw`(?<![\w&])#(\d+)(?!\w)`
const REF = new RegExp(`${SKIP}|${SLUG}|${BARE}`, 'g')

export const find = (text: string, { repo }: Ctx): Match[] =>
  [...text.matchAll(REF)].flatMap(({ 0: label, 1: slug, 2: slugNumber, 3: number, index: start = 0 }) => {
    const end = start + label.length

    if (slug !== undefined) {
      return [{ start, end, label, href: `https://github.com/${slug}/issues/${slugNumber}` }]
    }

    return number !== undefined && repo !== null ? [{ start, end, label, href: `https://github.com/${repo}/issues/${number}` }] : []
  })

const link = (text: string, ctx: Ctx) =>
  find(text, ctx).reduceRight((out, { start, end, label, href }) => `${out.slice(0, start)}[${label}](${href})${out.slice(end)}`, text)

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const remote = (await $.session.repo())?.remote
    const repo = (remote && REMOTE.exec(remote)?.[1]) || null

    return next({ ...e, props: { ...e.props, text: link(e.props.text, { repo }) } })
  })
}
