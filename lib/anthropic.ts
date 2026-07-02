// =============================================================
// Shim client Anthropic — interface SDK minimale via fetch
// =============================================================
// MTC37 appelle l'API Anthropic en `fetch` brut (cf. lib/openai.ts), sans le SDK
// officiel. Les fichiers de l'assistant (portés d'ATG) attendent un objet
// `anthropic.messages.create(...)` qui renvoie `{ content: [{ type, text }] }`.
// Ce shim fournit EXACTEMENT cette interface (sous-ensemble utilisé) en fetch,
// avec la chaîne de repli modèle (MODEL_CHAIN) → robuste au retrait d'un snapshot.

import { MODEL_CHAIN } from './openai'

// Modèle préféré (surchargeable sans redéploiement). Même défaut qu'ATG / openai.ts.
export const MODELE_CLAUDE = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'

type Role = 'user' | 'assistant'

interface CreateArgs {
  model?: string
  max_tokens: number
  temperature?: number
  system?: string
  messages: { role: Role; content: string }[]
}
interface CreateOpts {
  timeout?: number
}
interface BlocContenu {
  type: string
  text?: string
}
interface CreateResult {
  content: BlocContenu[]
}

async function create(args: CreateArgs, opts?: CreateOpts): Promise<CreateResult> {
  const controller = new AbortController()
  const timer = opts?.timeout ? setTimeout(() => controller.abort(), opts.timeout) : null
  // Modèle demandé d'abord, puis la chaîne de repli (dédupliquée).
  const chain = Array.from(new Set([args.model || MODELE_CLAUDE, ...MODEL_CHAIN]))
  try {
    let lastErr: Error | null = null
    for (const model of chain) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: args.max_tokens,
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          ...(args.system ? { system: args.system } : {}),
          messages: args.messages,
        }),
        signal: controller.signal,
      })
      // 404 = modèle retiré → on tente le suivant de la chaîne.
      if (res.status === 404) {
        lastErr = new Error(`Modèle ${model} indisponible (404)`)
        continue
      }
      if (!res.ok) {
        throw new Error(`Erreur Anthropic: ${res.status}`)
      }
      const data = await res.json()
      return { content: Array.isArray(data?.content) ? data.content : [] }
    }
    throw lastErr ?? new Error('Aucun modèle Anthropic disponible')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const anthropic = { messages: { create } }
