import { formatDate } from '../../utils/format.js'
import { createId } from '../../utils/id.js'
import * as db from './db.js'
import type { HistoryArchive } from './history/importArchive.js'
import { addHistorySessions, deleteAllHistory, useChatStore } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'
export type { HistoryArchive } from './history/importArchive.js'

// 导入、导出与全部删除串行处理；支持 Web Locks 时在同源标签页之间也共用队列。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(() =>
    navigator.locks ? navigator.locks.request('chat-demo-history', run) : run()
  )
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        const session = Object.hasOwn(sessionCache, summary.id)
          ? sessionCache[summary.id]
          : await db.loadSession(summary.id)
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob }
  })

export const previewHistory = async (
  source: Blob,
  signal: AbortSignal
): Promise<HistoryArchive> => {
  const { inspectArchive } = await import('./history/importArchive.js')
  signal.throwIfAborted()
  return inspectArchive(source, signal)
}

/** 仅暂存需要导入的会话。提交时再与正式库核对，返回实际新增的数量。 */
export const importHistory = (
  archive: HistoryArchive,
  selectedIds: ReadonlySet<string>
): Promise<number> =>
  enqueueBackup(async () => {
    const localIds = new Set(useChatStore.getState().sessions.map((session) => session.id))
    const newIds = new Set([...selectedIds].filter((id) => !localIds.has(id)))
    if (newIds.size === 0) {
      return 0
    }
    const { stageArchiveSessions } = await import('./history/importArchive.js')
    if (navigator.locks) {
      await db.clearStaging()
    }
    const batchId = createId()
    try {
      const counts = await stageArchiveSessions(archive, newIds, batchId)
      return await addHistorySessions(batchId, counts)
    } catch (error) {
      await db.clearStaging(batchId).catch(db.reportStorageError('clear unfinished history import'))
      throw error
    }
  })

export const clearHistory = (): Promise<void> => enqueueBackup(deleteAllHistory)
