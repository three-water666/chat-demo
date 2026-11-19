import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { toSessionSummary, type Session, type SessionSummary } from './types.js'

/** IndexedDB 存储结构版本；新增或调整存储、索引时递增。 */
const DB_VERSION = 11

/** 文件原件按附件的本地 id 存储，所有引用同一 id 的消息共用一份；用于缩略图、打开查看，以及没有 serverId 时补传。 */
export type StoredFile = {
  id: string
  blob: Blob
}

/** 文件引用留在摘要中，删除会话时通过索引判断原件是否仍被引用。 */
type StoredSessionSummary = SessionSummary & { fileIds: string[] }

type Staged<T> = { id: string; value: T }
export type StagingCounts = { sessions: number; files: number }

interface ChatDB extends DBSchema {
  /** 当前使用的会话，界面读写都在这里 */
  sessions: { key: string; value: Session }
  sessionSummaries: {
    key: string
    value: StoredSessionSummary
    indexes: { fileIds: string }
  }
  /** 当前使用的文件原件 */
  files: { key: string; value: StoredFile }
  /** 每次导入独占一组暂存键；校验成功后在同一事务内写入正式数据并清理该组。 */
  sessionsStaging: { key: string; value: Staged<Session> }
  filesStaging: { key: string; value: Staged<StoredFile> }
}

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null

const storedSummary = (session: Session): StoredSessionSummary => ({
  ...toSessionSummary(session),
  fileIds: [
    ...new Set(
      session.messages.flatMap((message) =>
        message.role === 'user' ? message.files.map((file) => file.id) : []
      )
    ),
  ],
})

const abortTransaction = (tx: { abort(): void }) => {
  try {
    tx.abort()
  } catch {
    // 事务已因请求失败中止。
  }
}

// 每个操作拿到连接后立即创建事务；IndexedDB 按创建顺序执行范围重叠的事务，读取总能看到之前发起的写入。
const getDB = () =>
  (dbPromise ??= openDB<ChatDB>('chat-demo', DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      // 初始化当前格式需要的存储与索引，不迁移旧消息。
      for (const name of ['sessions', 'files', 'sessionsStaging', 'filesStaging'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
      const summaries = db.objectStoreNames.contains('sessionSummaries')
        ? tx.objectStore('sessionSummaries')
        : db.createObjectStore('sessionSummaries', { keyPath: 'id' })
      if (!summaries.indexNames.contains('fileIds')) {
        summaries.createIndex('fileIds', 'fileIds', { multiEntry: true })
      }
    },
  }).catch((error: unknown) => {
    // 打开失败后允许界面重试，避免一直复用已拒绝的 Promise。
    dbPromise = null
    throw error
  }))

export const loadSessionSummaries = async (): Promise<SessionSummary[]> =>
  (await (await getDB()).getAll('sessionSummaries')).map(toSessionSummary)

export const loadSession = async (id: string): Promise<Session | undefined> =>
  (await getDB()).get('sessions', id)

/** 逐条读取本地会话，避免一次把整份历史加载到内存。 */
export const visitStoredSessions = async (
  visit: (session: Session) => void,
  signal: AbortSignal
): Promise<void> => {
  const db = await getDB()
  if (signal.aborted) {
    return
  }
  const tx = db.transaction('sessions', 'readonly')
  await Promise.all([
    (async () => {
      for (
        let cursor = await tx.store.openCursor();
        cursor && !signal.aborted;
        cursor = await cursor.continue()
      ) {
        visit(cursor.value)
      }
    })(),
    tx.done,
  ])
}

export const saveSession = async (session: Session, files: StoredFile[] = []): Promise<void> => {
  const summary = storedSummary(session)
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        for (const file of files) {
          await tx.objectStore('files').put(file)
        }
        await tx.objectStore('sessions').put(session)
        await tx.objectStore('sessionSummaries').put(summary)
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

/** 未打开的会话也可重命名，只读取该会话，原子更新详情和列表。 */
export const renameSession = async (id: string, title: string): Promise<void> => {
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        const sessions = tx.objectStore('sessions')
        const session = await sessions.get(id)
        if (session) {
          session.title = title
          await sessions.put(session)
          await tx.objectStore('sessionSummaries').put(storedSummary(session))
        }
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

/** 删除会话，仅清理已无会话引用的本地原件；远端文件不删。 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        const summaries = tx.objectStore('sessionSummaries')
        const summary = await summaries.get(sessionId)
        await tx.objectStore('sessions').delete(sessionId)
        await summaries.delete(sessionId)
        for (const id of summary?.fileIds ?? []) {
          if ((await summaries.index('fileIds').count(id)) === 0) {
            await tx.objectStore('files').delete(id)
          }
        }
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

export const saveFiles = async (files: StoredFile[]): Promise<void> => {
  const tx = (await getDB()).transaction('files', 'readwrite')
  await Promise.all([...files.map((file) => tx.store.put(file)), tx.done])
}

export const loadFile = async (id: string): Promise<Blob | undefined> =>
  (await (await getDB()).get('files', id))?.blob

const stagingKey = (batchId: string, id: string) => `${batchId}:${id}`
const stagingRange = (batchId: string) =>
  IDBKeyRange.bound(`${batchId}:`, `${batchId};`, false, true)

/** 有跨标签页锁时可清理中断遗留的数据；失败时按批次清理。 */
export const clearStaging = async (batchId?: string): Promise<void> => {
  const tx = (await getDB()).transaction(['sessionsStaging', 'filesStaging'], 'readwrite')
  const sessions = tx.objectStore('sessionsStaging')
  const files = tx.objectStore('filesStaging')
  const range = batchId === undefined ? undefined : stagingRange(batchId)
  await Promise.all(
    range
      ? [sessions.delete(range), files.delete(range), tx.done]
      : [sessions.clear(), files.clear(), tx.done]
  )
}

export const addStagingSession = async (batchId: string, session: Session): Promise<void> => {
  const db = await getDB()
  await db.add('sessionsStaging', { id: stagingKey(batchId, session.id), value: session })
}

export const saveStagingFile = async (batchId: string, file: StoredFile): Promise<void> => {
  await (await getDB()).add('filesStaging', { id: stagingKey(batchId, file.id), value: file })
}

/** 回填会话之间共用的图片原件 MIME，保留归档给出的 isImage 标识。 */
export const updateStagingFileTypes = async (
  batchId: string,
  types: ReadonlyMap<string, string>
): Promise<void> => {
  const tx = (await getDB()).transaction('sessionsStaging', 'readwrite')
  await Promise.all([
    (async () => {
      for (
        let cursor = await tx.store.openCursor(stagingRange(batchId));
        cursor;
        cursor = await cursor.continue()
      ) {
        const record = cursor.value
        let changed = false
        for (const message of record.value.messages) {
          if (message.role !== 'user') {
            continue
          }
          for (const file of message.files) {
            const type = types.get(file.id) ?? ''
            if (file.mimeType !== type) {
              file.mimeType = type
              changed = true
            }
          }
        }
        if (changed) {
          await cursor.update(record)
        }
      }
    })(),
    tx.done,
  ])
}

/** 原子追加新会话和相关原件。用正式库核对 ID，避免并发导入时覆盖记录。 */
export const commitStaging = async (
  batchId: string,
  expected: StagingCounts,
  localIds: ReadonlySet<string>
): Promise<SessionSummary[]> => {
  const summaries: SessionSummary[] = []
  const tx = (await getDB()).transaction(
    ['sessions', 'sessionSummaries', 'files', 'sessionsStaging', 'filesStaging'],
    'readwrite'
  )
  const insert = async () => {
    try {
      const sessions = tx.objectStore('sessions')
      const summaryStore = tx.objectStore('sessionSummaries')
      const files = tx.objectStore('files')
      const stagedSessions = tx.objectStore('sessionsStaging')
      const stagedFiles = tx.objectStore('filesStaging')
      const range = stagingRange(batchId)
      if (
        (await stagedSessions.count(range)) !== expected.sessions ||
        (await stagedFiles.count(range)) !== expected.files
      ) {
        throw new Error('History import staging changed before commit')
      }
      const fileIds = new Set<string>()
      for (
        let cursor = await stagedSessions.openCursor(range);
        cursor;
        cursor = await cursor.continue()
      ) {
        const session = cursor.value.value
        if (localIds.has(session.id) || (await sessions.count(session.id)) > 0) {
          continue
        }
        const summary = storedSummary(session)
        await sessions.add(session)
        await summaryStore.put(summary)
        summaries.push(toSessionSummary(summary))
        for (const id of summary.fileIds) {
          fileIds.add(id)
        }
      }
      for (
        let cursor = await stagedFiles.openCursor(range);
        cursor;
        cursor = await cursor.continue()
      ) {
        const file = cursor.value.value
        if (fileIds.has(file.id) && (await files.count(file.id)) === 0) {
          await files.add(file)
        }
      }
      await stagedSessions.delete(range)
      await stagedFiles.delete(range)
    } catch (error) {
      abortTransaction(tx)
      throw error
    }
  }
  await Promise.all([insert(), tx.done])
  return summaries
}

/** 在一个事务内删除全部会话、摘要、附件原件和暂存数据。 */
export const clearStoredHistory = async (): Promise<void> => {
  const stores = [
    'sessions',
    'sessionSummaries',
    'files',
    'sessionsStaging',
    'filesStaging',
  ] as const
  const tx = (await getDB()).transaction(stores, 'readwrite')
  await Promise.all([...stores.map((store) => tx.objectStore(store).clear()), tx.done])
}

/** 本地存储失败不打断对话，只在控制台留痕 */
export const reportStorageError = (action: string) => (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[storage] ${action} failed`, error)
}
