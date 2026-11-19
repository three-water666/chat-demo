import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'

export const historyDownloadRelay = {
  path: '/_history-download',
  host: 'deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com',
}

const MAX_LINK_LENGTH = 8192

const parseExportLink = (body: string): URL | null => {
  try {
    const value: unknown = JSON.parse(body)
    if (typeof value !== 'string') {
      return null
    }
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.host === historyDownloadRelay.host &&
      /^\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.zip$/i.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url
      : null
  } catch {
    return null
  }
}

/** 本地开发服务器只转发 DeepSeek 官方导出的 ZIP。签名链接通过请求体传递。 */
export const serveHistoryDownload = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  response.setHeader('Cache-Control', 'no-store')
  const site = request.headers['sec-fetch-site']
  if (
    request.method !== 'POST' ||
    request.headers['content-type'] !== 'application/json' ||
    (site && site !== 'same-origin')
  ) {
    response.writeHead(400).end()
    return
  }
  const controller = new AbortController()
  response.once('close', () => controller.abort())
  try {
    let body = ''
    for await (const chunk of request.setEncoding('utf8')) {
      body += String(chunk)
      if (body.length > MAX_LINK_LENGTH) {
        response.writeHead(413).end()
        return
      }
    }
    const url = parseExportLink(body)
    if (!url) {
      response.writeHead(400).end()
      return
    }
    const download = await fetch(url, { redirect: 'error', signal: controller.signal })
    if (!download.ok || !download.body) {
      await download.body?.cancel()
      response.writeHead(download.ok ? 502 : download.status).end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/zip' })
    await pipeline(download.body, response)
  } catch {
    if (!response.headersSent && !response.destroyed) {
      response.writeHead(502).end()
    } else {
      response.destroy()
    }
  }
}
