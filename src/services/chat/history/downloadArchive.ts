import { fail } from './errors.js'

export const parseHistoryUrl = (value: string): URL | null => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url : null
  } catch {
    return null
  }
}

export const downloadArchive = async (url: URL, signal: AbortSignal): Promise<Blob> => {
  const relay = __HISTORY_DOWNLOAD_RELAY__
  const options: RequestInit = {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  }
  let response: Response
  try {
    response =
      relay?.host === url.host
        ? await fetch(relay.path, {
            ...options,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(url.href),
          })
        : await fetch(url, options)
  } catch {
    return fail('historyLinkDownloadFailed')
  }
  if (!response.ok) {
    return fail(
      [401, 403, 404, 410].includes(response.status)
        ? 'historyLinkUnavailable'
        : 'historyLinkDownloadFailed'
    )
  }
  try {
    return await response.blob()
  } catch {
    return fail('historyLinkDownloadFailed')
  }
}
