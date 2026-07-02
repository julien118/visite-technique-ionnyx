// =============================================================
// fetch robuste : timeout + retries (pour les appels réseau best-effort)
// =============================================================
// Telegram et Groq sont parfois sujets à des blips réseau transitoires
// (`fetch failed`, timeout, reset). Un seul échec ne doit JAMAIS faire perdre un
// message de ticket. Ce helper retente automatiquement avec un petit backoff.

export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2
  const timeoutMs = opts.timeoutMs ?? 12000
  let lastErr: unknown
  for (let tentative = 0; tentative <= retries; tentative++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      // 5xx = on retente (souci côté serveur distant) ; 4xx = inutile (erreur cliente).
      if (res.status >= 500 && tentative < retries) {
        lastErr = new Error(`HTTP ${res.status}`)
        await pause(tentative)
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      if (tentative < retries) await pause(tentative)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed après retries')
}

function pause(tentative: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 500 * (tentative + 1)))
}
