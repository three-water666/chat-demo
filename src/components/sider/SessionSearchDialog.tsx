import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { searchSessions, type SessionSearchResult } from '../../services/chat/searchSessions.js'
import { selectSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconSearchOutline16 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionSearchDialog.module.css'

type SearchState = {
  query: string
  sessions: SessionSummary[]
  matches: SessionSearchResult[] | null
}

export const SessionSearchDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const importing = useChatStore((state) => state.importingHistory)
  const [input, setInput] = useState('')
  const [state, setState] = useState<SearchState | null>(null)
  const query = input.trim()
  const untitled = t('untitledChat')
  const result = state?.query === query && state.sessions === sessions ? state : null

  useEffect(() => {
    if (!query) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      let matches: SessionSearchResult[] | null
      try {
        matches = await searchSessions({
          sessions,
          cache: useChatStore.getState().sessionCache,
          query,
          untitled,
          signal: controller.signal,
        })
      } catch {
        matches = null
      }
      if (!controller.signal.aborted) {
        setState({ query, sessions, matches })
      }
    }, 160)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, sessions, untitled])

  const openSession = (id: string) => {
    selectSession(id)
    onClose()
    closeMobileSider()
  }

  return (
    <Modal
      title={t('searchChats')}
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={onClose}
    >
      <div className={styles.field}>
        <span aria-hidden="true">
          <IconSearchOutline16 />
        </span>
        <input
          type="search"
          aria-label={t('searchChats')}
          placeholder={t('searchChatPlaceholder')}
          autoFocus
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            const first = result?.matches?.[0]
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && first && !importing) {
              openSession(first.session.id)
            }
          }}
        />
      </div>
      {query ? (
        <div className={styles.results} aria-busy={!result}>
          {result?.matches?.length ? (
            result.matches.map(({ session, excerpt }) => (
              <button
                type="button"
                key={session.id}
                className={styles.result}
                disabled={importing}
                onClick={() => openSession(session.id)}
              >
                <span className={styles.resultTitle}>{session.title || untitled}</span>
                {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
              </button>
            ))
          ) : (
            <div className={styles.status} role="status">
              {t(
                !result
                  ? 'chatSearchLoading'
                  : result.matches
                    ? 'chatSearchEmpty'
                    : 'chatSearchFailed'
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  )
}
