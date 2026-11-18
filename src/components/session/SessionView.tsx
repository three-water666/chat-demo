import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import styles from './SessionView.module.css'

/** 会话页：消息列表与吸底的输入框 */
export const SessionView = ({ session, streaming }: { session: Session; streaming: boolean }) => {
  const t = useTranslate()
  return (
    <div className={styles.view}>
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div className={styles.inputContainer}>
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        }
      />
    </div>
  )
}
