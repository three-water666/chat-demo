import clsx from 'clsx'
import { useState } from 'react'
import { IconEditOutline16, IconWarningOutline16 } from '../base/icons.js'
import { useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { IconButton } from '../base/IconButton.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import { PlatformLink } from './PlatformLink.js'
import styles from './Settings.module.css'

/** API Key 的编辑状态在设置分组之间保留。 */
export const useApiKeyEditor = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return { apiKey, editing, setEditing, form, showInput: !apiKey || editing }
}

type ApiKeyEditor = ReturnType<typeof useApiKeyEditor>

/** API Key：保存后只显示掩码，点编辑按钮才能重新输入 */
export const ApiKeyField = ({ editor }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const { apiKey, editing, setEditing, form, showInput } = editor
  const feedback = showInput ? form.error : form.verified ? t('apiKeyVerificationSucceeded') : null

  return (
    <div className={styles.cell}>
      <div className={styles.apiKey}>
        <aside className={styles.apiKeyNotice}>
          <span className={styles.apiKeyNoticeIcon} aria-hidden="true">
            <IconWarningOutline16 />
          </span>
          <div>
            <strong>{t('apiKeyNoticeTitle')}</strong>
            <p>{t('apiKeyNoticeDescription')}</p>
          </div>
        </aside>
        <div className={styles.apiKeyHeading}>
          <div className={styles.label}>{t('apiKeyStart')}</div>
          <PlatformLink className={styles.apiKeyLink} href="https://platform.deepseek.com/api_keys">
            {t('getApiKey')}
          </PlatformLink>
        </div>
        {apiKey && !editing ? (
          <div className={styles.apiKeySaved}>
            <span className={styles.apiKeyMask}>{'*'.repeat(apiKey.length)}</span>
            <IconButton
              tone="primary"
              icon={<IconEditOutline16 />}
              tooltip={t('apiKeyEdit')}
              onClick={() => setEditing(true)}
            />
          </div>
        ) : (
          <div className={styles.apiKeyInput}>
            <input
              type="password"
              placeholder={t('apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              // 移动端打开设置时不弹键盘，点编辑后才聚焦
              autoFocus={!isMobile || editing}
              value={form.value}
              onChange={(event) => form.setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  void form.submit()
                }
              }}
              onBlur={() => {
                // 修改时没输入就离开，回到已保存的状态
                if (apiKey && !form.value.trim()) {
                  setEditing(false)
                }
              }}
            />
            {!isMobile && form.value.trim() ? (
              <>
                <span className={styles.divider} />
                <button
                  type="button"
                  className={styles.confirm}
                  disabled={form.verifying}
                  // 保持输入框焦点
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void form.submit()}
                >
                  {form.verifying ? t('apiKeyVerifying') : t('confirm')}
                </button>
              </>
            ) : null}
          </div>
        )}
        <div
          className={clsx(styles.apiKeyFeedback, showInput ? styles.error : styles.success)}
          role="status"
        >
          {feedback}
        </div>
      </div>
      {isMobile ? <ApiKeyConfirm editor={editor} /> : null}
    </div>
  )
}

/** 移动端：在 API Key 输入框下方显示「确定」。 */
const ApiKeyConfirm = ({ editor: { showInput, form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  return showInput && form.value.trim() ? (
    <button
      type="button"
      className={styles.mobileConfirm}
      disabled={form.verifying}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void form.submit()}
    >
      {form.verifying ? t('apiKeyVerifying') : t('confirm')}
    </button>
  ) : null
}
