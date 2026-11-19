import { create } from 'zustand'
import { useSettings } from '../../services/settings.js'

/** 设置弹窗的分组：API 配置 / 通用设置 / 数据管理 */
export type SettingsSection = 'api' | 'general' | 'data'

/** 设置弹窗：侧边栏、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'api' as SettingsSection,
}))

export const openSettings = (section: SettingsSection = 'api') =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有 API Key 时打开「API 配置」，返回是否已有 Key */
export const ensureApiKey = () => {
  if (useSettings.getState().apiKey) {
    return true
  }
  openSettings('api')
  return false
}
