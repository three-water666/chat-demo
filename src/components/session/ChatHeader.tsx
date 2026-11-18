import { useEffect, useState } from 'react'
import { IconMenuOutline20, IconNewChatOutline20 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { getApiPricingPeriod } from '../../services/api/pricingPeriod.js'
import { newChat } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import { IconButton } from '../base/IconButton.js'
import { CollapsedSider } from '../sider/CollapsedSider.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './ChatHeader.module.css'

const periodLabels = {
  peak: 'apiPeakHours',
  offPeak: 'apiOffPeakHours',
  unconfirmed: 'apiPricingPeriodUnconfirmed',
} as const

const ApiPricingBadge = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [period, setPeriod] = useState(() => getApiPricingPeriod(Date.now()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const now = Date.now()
      setPeriod(getApiPricingPeriod(now))
      timer = setTimeout(refresh, 60_000 - (now % 60_000))
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const path = locale === 'zh-CN' ? '/zh-cn' : ''
  return (
    <span className={styles.periodStatus} role="status">
      <a
        className={styles.apiPeriod}
        data-period={period}
        href={`https://api-docs.deepseek.com${path}/quick_start/pricing/`}
        target="_blank"
        rel="noreferrer"
        title={t('apiPricingDetails')}
      >
        <span>{t(periodLabels[period])}</span>
      </a>
    </span>
  )
}

export const ChatHeader = ({
  title,
  isMobile,
  siderCollapsed,
}: {
  title?: string
  isMobile: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  return (
    <header className={styles.header}>
      {isMobile ? (
        <IconButton
          size="xl"
          icon={<IconMenuOutline20 />}
          aria-label={t('expandSiderbarButton')}
          onClick={openMobileSider}
        />
      ) : siderCollapsed ? (
        <CollapsedSider />
      ) : null}
      {title === undefined ? null : <div className={styles.title}>{title}</div>}
      <div className={styles.actions}>
        <ApiPricingBadge />
        <IconButton
          size={isMobile ? 'xl' : 'm'}
          tone="primary"
          icon={<IconNewChatOutline20 />}
          tooltip={t('newChat')}
          tooltipPlacement="bottom"
          onClick={newChat}
        />
      </div>
    </header>
  )
}
