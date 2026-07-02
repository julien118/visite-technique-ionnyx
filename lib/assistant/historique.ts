// =============================================================
// Historique de conversation de l'assistant (compréhension seulement)
// =============================================================
// Mémoire de la conversation EN COURS, transmise par le frontend à chaque appel
// (serveur stateless, comme « dernierClient »). Sert UNIQUEMENT à la COMPRÉHENSION
// (aiguillage + analyse des domaines) pour résoudre une question qui s'appuie sur
// le passé (« le compte rendu dont on parlait », « et le devis ? »). Il n'alimente
// JAMAIS la rédaction : les réponses restent FAITS-only (vraies données).
//
// Anti-hallucination : une référence se résout vers un NOM qui est ensuite re-validé
// contre les vraies données par le code du domaine (matching exact/souple). Si la
// référence est ambiguë ou introuvable, on laisse le champ à null et le code demande
// de préciser, jamais de devinette.

// Un message d'historique transmis par le frontend (questions de l'artisan +
// réponses de l'assistant). Forme volontairement minimale.
export interface MessageHistorique {
  role: 'user' | 'bot'
  texte: string
}

// Bornage : on ne transmet jamais toute la conversation au LLM. On garde les
// derniers échanges et on tronque les réponses bot pour ne pas exploser les tokens.
const MAX_MESSAGES = 8
const MAX_BOT = 400
const MAX_USER = 300

function tronquer(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t
}

// Nettoie + borne un historique brut venu du frontend (filtre les entrées mal
// formées). Renvoie un tableau sûr, éventuellement vide.
export function nettoyerHistorique(brut?: unknown): MessageHistorique[] {
  if (!Array.isArray(brut)) return []
  return brut
    .filter(
      (m): m is MessageHistorique =>
        !!m &&
        ((m as MessageHistorique).role === 'user' || (m as MessageHistorique).role === 'bot') &&
        typeof (m as MessageHistorique).texte === 'string' &&
        (m as MessageHistorique).texte.trim().length > 0,
    )
    .map((m) => ({ role: m.role, texte: m.texte }))
}

// Construit un transcript compact des derniers échanges (du plus ancien au plus
// récent), borné et tronqué. Retourne '' si pas d'historique exploitable.
export function formaterHistorique(historique?: MessageHistorique[] | null): string {
  if (!Array.isArray(historique) || historique.length === 0) return ''
  return historique
    .slice(-MAX_MESSAGES)
    .filter((m) => m && typeof m.texte === 'string' && m.texte.trim())
    .map((m) =>
      m.role === 'user'
        ? `Artisan : ${tronquer(m.texte, MAX_USER)}`
        : `Assistant : ${tronquer(m.texte, MAX_BOT)}`,
    )
    .join('\n')
}

// Bloc à insérer dans un prompt d'ANALYSE de domaine quand un historique est fourni.
// Vide si pas d'historique (=> comportement strictement inchangé).
export function blocHistoriquePourAnalyse(historique?: MessageHistorique[] | null): string {
  const transcript = formaterHistorique(historique)
  if (!transcript) return ''
  return `
HISTORIQUE DE LA CONVERSATION EN COURS (du plus ancien au plus récent) :
---
${transcript}
---
RÈGLES D'USAGE DE L'HISTORIQUE :
- Si la question nomme explicitement un client ou un chantier, utilise CE nom : ignore l'historique pour l'identité.
- N'utilise l'historique QUE pour résoudre une référence qui n'est pas résoluble depuis la seule question (ex : « le compte rendu dont on parlait », « et le devis ? », « celui d'avant »).
- Ne JAMAIS inventer un nom ou une entité absent de la conversation. Si la référence est ambiguë (plusieurs candidats possibles) ou introuvable, NE DEVINE PAS : laisse le champ concerné à null (le code demandera de préciser).
`
}

// Bloc plus léger pour l'AIGUILLEUR (classification du sujet uniquement). Vide si
// pas d'historique.
export function blocHistoriquePourAiguillage(historique?: MessageHistorique[] | null): string {
  const transcript = formaterHistorique(historique)
  if (!transcript) return ''
  return `
HISTORIQUE DE LA CONVERSATION (pour comprendre une question qui s'appuie sur le passé, ex : « compare avec le premier », « le compte rendu dont on parlait ») :
---
${transcript}
---
Tu classes seulement le SUJET, tu n'inventes aucun client. Une question qui fait référence à un élément déjà évoqué relève du domaine de cet élément.
`
}
