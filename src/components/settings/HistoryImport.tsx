import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import {
  BackupError,
  importHistory,
  previewHistory,
  type HistoryArchive,
} from '../../services/chat/backup.js'
import { downloadArchive, parseHistoryUrl } from '../../services/chat/history/downloadArchive.js'
import { useChatStore } from '../../services/chat/store.js'
import { formatDate } from '../../utils/format.js'
import { Button } from '../base/Button.js'
import { IconLinkOutline16, IconUploadOutline14 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import styles from './HistoryImport.module.css'
import settingsStyles from './Settings.module.css'

type ImportStep =
  | { kind: 'link'; value: string; error?: TranslationKey }
  | { kind: 'loading'; message: TranslationKey }
  | { kind: 'failed'; error: TranslationKey }
  | { kind: 'selection'; archive: HistoryArchive; error?: TranslationKey }

const importError = (error: unknown): TranslationKey =>
  error instanceof BackupError ? error.key : 'historyImportFailed'

export const useHistoryImport = () => {
  const [step, setStep] = useState<ImportStep | null>(null)
  const [status, setStatus] = useState<TranslationMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const request = useRef<AbortController | null>(null)
  const committing = useRef(false)

  useEffect(() => () => request.current?.abort(), [])

  const load = async (source: File | URL) => {
    if (request.current || committing.current) {
      return
    }
    const controller = new AbortController()
    request.current = controller
    setStatus(null)
    try {
      let blob: Blob
      if (source instanceof URL) {
        setStep({ kind: 'loading', message: 'historyImportDownloading' })
        blob = await downloadArchive(source, controller.signal)
      } else {
        blob = source
      }
      controller.signal.throwIfAborted()
      setStep({ kind: 'loading', message: 'historyImportReading' })
      const archive = await previewHistory(blob, controller.signal)
      if (!controller.signal.aborted) {
        setStep({ kind: 'selection', archive })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const key = importError(error)
        setStep(
          source instanceof URL
            ? { kind: 'link', value: source.href, error: key }
            : { kind: 'failed', error: key }
        )
      }
    } finally {
      if (request.current === controller) {
        request.current = null
      }
    }
  }

  const confirm = async (selected: ReadonlySet<string>) => {
    if (step?.kind !== 'selection' || selected.size === 0 || committing.current) {
      return
    }
    committing.current = true
    setSaving(true)
    setStep({ kind: 'selection', archive: step.archive })
    try {
      const count = await importHistory(step.archive, selected)
      setStatus({
        key:
          count === 0
            ? 'historyImportNoNew'
            : count === 1
              ? 'historyImportedOne'
              : 'historyImported',
        params: { count },
      })
      setStep(null)
    } catch (error) {
      setStep({ kind: 'selection', archive: step.archive, error: importError(error) })
    } finally {
      committing.current = false
      setSaving(false)
    }
  }

  return {
    step,
    status,
    saving,
    openLink: () => setStep({ kind: 'link', value: '' }),
    load,
    confirm,
    cancel: () => {
      if (!committing.current) {
        request.current?.abort()
        request.current = null
        setStep(null)
      }
    },
  }
}

type ImportControl = ReturnType<typeof useHistoryImport>

export const HistoryImportActions = ({
  control,
  disabled,
}: {
  control: ImportControl
  disabled: boolean
}) => {
  const t = useTranslate()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.actions}>
      <Button
        variant="outlined"
        size="m"
        className={settingsStyles.cellButton}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <IconUploadOutline14 />
        {t('historyImportFile')}
      </Button>
      <Button
        variant="outlined"
        size="m"
        className={settingsStyles.cellButton}
        disabled={disabled}
        onClick={control.openLink}
      >
        <IconLinkOutline16 />
        {t('historyImportLink')}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) {
            void control.load(file)
          }
        }}
      />
    </div>
  )
}

const ImportLink = ({
  step,
  control,
}: {
  step: Extract<ImportStep, { kind: 'link' }>
  control: ImportControl
}) => {
  const t = useTranslate()
  const formId = useId()
  const inputId = useId()
  const [value, setValue] = useState(step.value)
  const [error, setError] = useState(step.error)
  const url = parseHistoryUrl(value)
  return (
    <Modal
      title={t('historyImportLink')}
      className={styles.dialog}
      onClose={control.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={control.cancel}>
            {t('cancel')}
          </Button>
          <Button size="m" type="submit" form={formId} disabled={!value.trim()}>
            {t('historyImportLinkRead')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.linkForm}
        onSubmit={(event) => {
          event.preventDefault()
          if (url) {
            void control.load(url)
          } else {
            setError('historyLinkInvalid')
          }
        }}
      >
        <label htmlFor={inputId}>{t('historyImportLinkLabel')}</label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          placeholder="https://"
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value)
            setError(undefined)
          }}
        />
        {error ? (
          <div className={settingsStyles.error} role="alert">
            {t(error)}
          </div>
        ) : null}
        {error === 'historyLinkDownloadFailed' && url ? (
          <a className={styles.downloadLink} href={url.href} target="_blank" rel="noreferrer">
            {t('historyLinkDownloadZip')}
          </a>
        ) : null}
      </form>
    </Modal>
  )
}

const SelectImport = ({
  step,
  control,
}: {
  step: Extract<ImportStep, { kind: 'selection' }>
  control: ImportControl
}) => {
  const t = useTranslate()
  const local = useChatStore((state) => state.sessions)
  const localIds = new Set(local.map(({ id }) => id))
  const { sessions } = step.archive
  const [selected, setSelected] = useState(
    () => new Set(sessions.filter(({ id }) => !localIds.has(id)).map(({ id }) => id))
  )
  const [filter, setFilter] = useState('')
  const selectedIds = new Set([...selected].filter((id) => !localIds.has(id)))
  const query = filter.trim().toLocaleLowerCase()
  const untitled = t('untitledChat')
  const shown = sessions.filter(({ title }) =>
    (title || untitled).toLocaleLowerCase().includes(query)
  )
  const visibleIds = shown.filter(({ id }) => !localIds.has(id)).map(({ id }) => id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const updateSelection = (ids: string[], checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (checked) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }

  const bulkLabel = allVisibleSelected
    ? query
      ? 'historyImportClearMatches'
      : 'historyImportClearAll'
    : query
      ? 'historyImportSelectMatches'
      : 'historyImportSelectAll'

  return (
    <Modal
      title={t('historyImportSelecting')}
      className={styles.dialog}
      onClose={control.cancel}
      footer={
        <>
          <Button
            variant="outlined"
            size="m"
            autoFocus
            disabled={control.saving}
            onClick={control.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            size="m"
            disabled={control.saving || selectedIds.size === 0}
            onClick={() => void control.confirm(selectedIds)}
          >
            {t(control.saving ? 'historyImportSaving' : 'historyImportConfirm')}
          </Button>
        </>
      }
    >
      {sessions.length ? (
        <div className={styles.selection} aria-busy={control.saving}>
          <input
            className={styles.input}
            type="search"
            placeholder={t('historyImportSearch')}
            aria-label={t('historyImportSearch')}
            value={filter}
            disabled={control.saving}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          <div className={styles.toolbar}>
            <div role="status">
              {t('historyImportSelected', { count: selectedIds.size, total: sessions.length })}
            </div>
            <Button
              variant="outlined"
              size="s"
              disabled={control.saving || visibleIds.length === 0}
              onClick={() => updateSelection(visibleIds, !allVisibleSelected)}
            >
              {t(bulkLabel)}
            </Button>
          </div>
          {shown.length ? (
            <div className={styles.list} role="group" aria-label={t('historyImportSelecting')}>
              {shown.map(({ id, title, updatedAt, messageCount }) => {
                const exists = localIds.has(id)
                return (
                  <label key={id} className={clsx(styles.session, exists && styles.existing)}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      disabled={control.saving || exists}
                      onChange={(event) => updateSelection([id], event.currentTarget.checked)}
                    />
                    <span className={styles.sessionText}>
                      <span className={styles.sessionTitle} title={title || untitled}>
                        {title || untitled}
                      </span>
                      <span>
                        {formatDate(updatedAt)} ·{' '}
                        {t(
                          messageCount === 1
                            ? 'historyImportMessageCountOne'
                            : 'historyImportMessageCount',
                          {
                            count: messageCount,
                          }
                        )}
                      </span>
                    </span>
                    {exists ? (
                      <span className={styles.existingLabel}>{t('historyImportExisting')}</span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          ) : (
            <div role="status">{t('historyImportSearchEmpty')}</div>
          )}
          {step.error ? (
            <div className={settingsStyles.error} role="alert">
              {t(step.error)}
            </div>
          ) : null}
        </div>
      ) : (
        <div role="status">{t('historyImportEmpty')}</div>
      )}
    </Modal>
  )
}

export const HistoryImportDialog = ({ control }: { control: ImportControl }) => {
  const t = useTranslate()
  const { step } = control
  if (!step) {
    return null
  }
  if (step.kind === 'link') {
    return <ImportLink step={step} control={control} />
  }
  if (step.kind === 'selection') {
    return <SelectImport step={step} control={control} />
  }
  return (
    <Modal
      title={t('historyImport')}
      className={styles.dialog}
      onClose={control.cancel}
      footer={
        <Button variant="outlined" size="m" autoFocus onClick={control.cancel}>
          {t(step.kind === 'loading' ? 'cancel' : 'close')}
        </Button>
      }
    >
      {step.kind === 'loading' ? (
        <div role="status">{t(step.message)}</div>
      ) : (
        <div className={settingsStyles.error} role="alert">
          {t(step.error)}
        </div>
      )}
    </Modal>
  )
}
