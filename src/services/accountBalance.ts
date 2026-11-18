import { create } from 'zustand'
import { getAccountBalances, type AccountBalance } from './api/client.js'
import { classifyApiError, type ApiErrorCondition } from './api/errors.js'
import { useSettings } from './settings.js'

const CACHE_DURATION = 60_000
const MANUAL_REFRESH_INTERVAL = 5_000
const REQUEST_TIMEOUT = 12_000

type BalanceState = {
  balances: AccountBalance[] | null
  error: ApiErrorCondition | null
  loading: boolean
  refreshBlocked: boolean
}

const initialState: BalanceState = {
  balances: null,
  error: null,
  loading: false,
  refreshBlocked: false,
}

export const useAccountBalance = create<BalanceState>(() => initialState)

let activeRequest: AbortController | null = null
let lastRequestAt = -Infinity
let refreshTimer: ReturnType<typeof setTimeout> | undefined

useSettings.subscribe((settings, previous) => {
  if (settings.apiKey === previous.apiKey) {
    return
  }
  activeRequest?.abort()
  activeRequest = null
  lastRequestAt = -Infinity
  clearTimeout(refreshTimer)
  useAccountBalance.setState(initialState)
})

/** 同一 API Key 的余额保存在内存中，打开设置和切换分组共用一次请求。 */
export const refreshAccountBalance = async (manual = false): Promise<void> => {
  const apiKey = useSettings.getState().apiKey
  const now = performance.now()
  const interval = manual ? MANUAL_REFRESH_INTERVAL : CACHE_DURATION
  if (!apiKey || activeRequest || now - lastRequestAt < interval) {
    return
  }

  lastRequestAt = now
  const controller = new AbortController()
  activeRequest = controller
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    useAccountBalance.setState({ refreshBlocked: false })
  }, MANUAL_REFRESH_INTERVAL)
  useAccountBalance.setState({ loading: true, refreshBlocked: true, error: null })

  let result: Partial<BalanceState>
  try {
    result = { balances: await getAccountBalances(apiKey, controller.signal) }
  } catch (error) {
    const condition = classifyApiError(error)
    result =
      condition === 'unauthorized' ? { balances: null, error: condition } : { error: condition }
  } finally {
    clearTimeout(timeout)
  }

  if (activeRequest === controller) {
    activeRequest = null
    useAccountBalance.setState({ ...result, loading: false })
  }
}
