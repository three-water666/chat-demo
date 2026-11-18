import { useState } from 'react'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiKey } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

type Verification =
  | { status: 'idle' | 'verifying' | 'success' }
  | { status: 'error'; cause: unknown }

/** 输入 API Key 后先用 GET /models 校验，通过才保存 */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const [verification, setVerification] = useState<Verification>({ status: 'idle' })
  const verifying = verification.status === 'verifying'
  let error: string | null = null
  if (verification.status === 'error') {
    const { cause } = verification
    const condition = classifyApiError(cause)
    error =
      condition === 'unauthorized'
        ? t('apiKeyInvalid')
        : condition === 'network'
          ? t('commonNetworkErrorToast')
          : t('apiKeyVerificationFailed', {
              message:
                cause instanceof ApiError && cause.localMessage
                  ? t(cause.localMessage.key, cause.localMessage.params)
                  : cause instanceof Error
                    ? cause.message
                    : String(cause),
            })
  }

  const submit = async () => {
    const apiKey = value.trim()
    if (!apiKey || verifying) {
      return
    }
    setVerification({ status: 'verifying' })
    try {
      await verifyApiKey(apiKey)
      setApiKey(apiKey)
      setValue('')
      onSaved?.()
      setVerification({ status: 'success' })
    } catch (e) {
      setVerification({ status: 'error', cause: e })
    }
  }

  return { value, setValue, verifying, verified: verification.status === 'success', error, submit }
}
