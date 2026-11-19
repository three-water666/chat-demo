import * as db from '../db.js'
import type { SessionSummary } from '../types.js'
import { BackupError, fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import {
  INDEX_PATH,
  MANIFEST_PATH,
  USER_PATH,
  parseSessionPath,
  sessionFilesDir,
  sessionPath,
} from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import { ArchiveError, isZipFile, readArchive, readEntry, type ArchiveEntry } from './zipReader.js'

type PreviewSession = SessionSummary & { messageCount: number }

export type HistoryArchive = {
  sessions: readonly PreviewSession[]
  entries: ReadonlyMap<string, ArchiveEntry>
}

/** 从原件字节补充图片 MIME；无法识别时为空字符串，图片身份仍由归档的 is_image 决定。 */
const imageType = (bytes: Uint8Array): string => {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 12))
  if (startsWith(0xff, 0xd8, 0xff)) {
    return 'image/jpeg'
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png'
  }
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif'
  }
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x42, 0x4d)) {
    return 'image/bmp'
  }
  if (startsWith(0x49, 0x49, 0x2a, 0) || startsWith(0x4d, 0x4d, 0, 0x2a)) {
    return 'image/tiff'
  }
  if (header.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header.slice(8, 12))) {
    return 'image/avif'
  }
  return ''
}

const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const text = await (await readEntry(entry)).text()
  try {
    return JSON.parse(text)
  } catch {
    return fail('backupInvalidJson')
  }
}

/** 预览只读取版本和会话索引，保留按需解压会话与图片的入口。 */
export const inspectArchive = async (file: Blob, signal?: AbortSignal): Promise<HistoryArchive> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  const entries = new Map<string, ArchiveEntry>()
  const sessionIds = new Set<string>()
  let manifest = false
  let index: SessionIndexEntry[] | undefined
  let currentSessionId: string | undefined

  try {
    for await (const entry of readArchive(file, signal)) {
      const { path } = entry
      const sessionId = parseSessionPath(path)
      if (!manifest) {
        if (path !== MANIFEST_PATH) {
          fail('backupUnrecognized')
        }
        checkManifest(await readJson(entry))
        manifest = true
      } else if (path === USER_PATH && !index && sessionIds.size === 0) {
        continue
      } else if (sessionId !== null && !index) {
        entries.set(path, entry)
        sessionIds.add(sessionId)
        currentSessionId = sessionId
      } else if (path === INDEX_PATH && !index) {
        index = readSessionIndex(await readJson(entry))
      } else if (
        index
          ? sessionIds.has(/^chat_sessions\/([^/]+)_files\//.exec(path)?.[1] ?? '')
          : currentSessionId && path.startsWith(sessionFilesDir(currentSessionId))
      ) {
        entries.set(path, entry)
      } else {
        fail('backupIncomplete')
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (!manifest) {
    fail('backupUnrecognized')
  }
  if (!index) {
    return fail('backupIncomplete')
  }
  const sessions = index.map((entry) => {
    if (!sessionIds.delete(entry.id)) {
      fail('backupIncomplete')
    }
    return {
      id: entry.id,
      title: entry.title ?? '',
      createdAt: Date.parse(entry.inserted_at),
      updatedAt: Date.parse(entry.updated_at),
      messageCount: entry.message_count,
    }
  })
  if (sessionIds.size > 0) {
    fail('backupIncomplete')
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return { sessions, entries }
}

/** 逐条暂存选中的会话及其图片；全部成功后由调用方提交。 */
export const stageArchiveSessions = async (
  archive: HistoryArchive,
  selectedIds: ReadonlySet<string>,
  batchId: string
): Promise<db.StagingCounts> => {
  const stored = new Map<string, string>()
  try {
    for (const id of selectedIds) {
      const entry = archive.entries.get(sessionPath(id)) ?? fail('backupIncomplete')
      const { session, images } = toLocalSession(readSessionFile(await readJson(entry)))
      if (session.id !== id) {
        fail('backupIncomplete')
      }
      for (const [path, fileId] of images) {
        const image = archive.entries.get(path)
        if (!image || stored.has(fileId)) {
          continue
        }
        const data = await readEntry(image)
        const type = imageType(new Uint8Array(await data.slice(0, 16).arrayBuffer()))
        await db.saveStagingFile(batchId, { id: fileId, blob: new Blob([data], { type }) })
        stored.set(fileId, type)
      }
      await db.addStagingSession(batchId, session)
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (stored.size > 0) {
    await db.updateStagingFileTypes(batchId, stored)
  }
  return { sessions: selectedIds.size, files: stored.size }
}
