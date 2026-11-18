import { useEffect, useRef, useState } from 'react'
import { refreshAccountBalance } from '../../services/accountBalance.js'

export const useBalanceRefresh = (apiKey: string | null, refreshBlocked: boolean) => {
  const topUpVisit = useRef<'opened' | 'away' | null>(null)
  const [returnedFor, setReturnedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!apiKey) {
      return
    }
    void refreshAccountBalance()

    const leave = () => {
      if (topUpVisit.current === 'opened') {
        topUpVisit.current = 'away'
      }
    }
    const resume = () => {
      if (topUpVisit.current === 'away' && document.visibilityState === 'visible') {
        topUpVisit.current = null
        setReturnedFor(apiKey)
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        leave()
      } else {
        resume()
      }
    }

    window.addEventListener('blur', leave)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      topUpVisit.current = null
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [apiKey])

  // 返回得太快时，等当前请求结束且刷新间隔已过，再查一次余额。
  useEffect(() => {
    if (returnedFor === null) {
      return
    }
    if (returnedFor !== apiKey) {
      setReturnedFor(null)
    } else if (!refreshBlocked) {
      setReturnedFor(null)
      void refreshAccountBalance(true)
    }
  }, [apiKey, refreshBlocked, returnedFor])

  const onTopUp = () => {
    if (apiKey) {
      topUpVisit.current = 'opened'
    }
  }

  const refresh = () => {
    setReturnedFor(null)
    void refreshAccountBalance(true)
  }

  return { onTopUp, refresh }
}
