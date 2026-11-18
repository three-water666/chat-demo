import { IconPanelLeftOutline16 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { IconButton } from '../base/IconButton.js'

/** 收起后左上角的展开按钮 */
export const CollapsedSider = () => {
  const t = useTranslate()
  return (
    <IconButton
      size="m"
      icon={<IconPanelLeftOutline16 />}
      tooltip={t('expandSiderbarButton')}
      tooltipPlacement="bottom"
      aria-expanded={false}
      onClick={() => setSiderCollapsed(false)}
    />
  )
}
