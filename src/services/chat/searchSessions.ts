import { getVisibleMessages } from './branches.js'
import { visitStoredSessions } from './db.js'
import type { Session, SessionSummary } from './types.js'

export type SessionSearchResult = {
  session: SessionSummary
  excerpt: string
}

const findExcerpt = (session: Session, keyword: string): string | undefined => {
  for (const message of getVisibleMessages(session)) {
    const texts =
      message.role === 'user'
        ? [message.content]
        : message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []))
    for (const text of texts) {
      const index = text.toLowerCase().indexOf(keyword)
      if (index < 0) {
        continue
      }
      const start = Math.max(0, index - 28)
      const end = start + 120
      const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim()
      return (start > 0 ? '…' : '') + excerpt + (end < text.length ? '…' : '')
    }
  }
  return undefined
}

export const searchSessions = async ({
  sessions,
  cache,
  query,
  untitled,
  signal,
}: {
  sessions: readonly SessionSummary[]
  cache: Readonly<Record<string, Session>>
  query: string
  untitled: string
  signal: AbortSignal
}): Promise<SessionSearchResult[]> => {
  const keyword = query.trim().toLowerCase()
  if (!keyword || signal.aborted) {
    return []
  }

  const matches = new Map<string, string>()
  const uncached = new Set<string>()
  const matchContent = (session: Session) => {
    const excerpt = findExcerpt(session, keyword)
    if (excerpt !== undefined) {
      matches.set(session.id, excerpt)
    }
  }
  for (const session of sessions) {
    if ((session.title || untitled).toLowerCase().includes(keyword)) {
      matches.set(session.id, '')
    } else if (Object.hasOwn(cache, session.id)) {
      matchContent(cache[session.id])
    } else {
      uncached.add(session.id)
    }
  }
  if (uncached.size > 0) {
    await visitStoredSessions((session) => {
      if (uncached.has(session.id)) {
        matchContent(session)
      }
    }, signal)
  }

  return sessions.flatMap((session) => {
    const excerpt = matches.get(session.id)
    return excerpt === undefined ? [] : [{ session, excerpt }]
  })
}
