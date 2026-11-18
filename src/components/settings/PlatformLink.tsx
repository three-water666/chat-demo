import type { MouseEvent, ReactNode } from 'react'
import { useIsMobile } from '../../app/viewport.js'

export const PlatformLink = ({
  href,
  className,
  onOpen,
  children,
}: {
  href: string
  className: string
  onOpen?: () => void
  children: ReactNode
}) => {
  const isMobile = useIsMobile()

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey) {
      return
    }
    onOpen?.()
    if (isMobile || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }

    let popup: Window | null = null
    try {
      popup = window.open('', '_blank', 'popup,width=720,height=760')
      if (!popup) {
        return
      }
      // 在离开空白页之前断开 opener，并用原生链接隐藏来源。
      popup.opener = null
      const link = popup.document.createElement('a')
      link.href = event.currentTarget.href
      link.rel = 'noreferrer'
      popup.document.body.append(link)
      link.click()
      event.preventDefault()
    } catch {
      popup?.close()
    }
  }

  return (
    <a href={href} className={className} target="_blank" rel="noreferrer" onClick={open}>
      {children}
    </a>
  )
}
