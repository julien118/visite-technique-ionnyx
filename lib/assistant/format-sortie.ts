// =============================================================
// Règles de SORTIE PROPRE + formatage partagés (assistant)
// =============================================================
// L'assistant ne doit JAMAIS renvoyer de markdown brut (dièses, étoiles, tirets de
// séparation, puces markdown) : uniquement du texte + des emojis. Ce bloc est
// injecté dans TOUS les prompts de rédaction (prévention). Un filet de sécurité au
// rendu (components/AssistantDevis.tsx) nettoie tout résidu (défense en profondeur).

export function blocReglesSortiePropre(): string {
  return `FORMAT DE SORTIE (STRICT) :
- Écris UNIQUEMENT en texte courant et emojis. Aucun caractère de mise en forme technique.
- INTERDIT : les dièses (#, ##, ###), les étoiles (*, **), les underscores (_), les accents graves, les lignes de tirets (---, ***, ___), les tableaux et les puces markdown (« - » ou « * » en début de ligne).
- Pour une liste, va à la ligne et commence chaque élément par « • ».
- Pour un titre de rubrique, écris une courte ligne suivie de « : » (jamais de dièse, jamais de gras markdown), éventuellement précédée d'un emoji.
- Sépare les blocs par une simple ligne vide, jamais par une ligne de tirets.
- Résultat attendu : propre et lisible sur mobile — seulement des lettres, des chiffres, une ponctuation normale et des emojis.`
}

// Formate un montant en euros « à la française » : « 4 500,00 € ». Sans dépendance
// ICU (formatage manuel) pour rester robuste côté serveur. Renvoie null si non fini.
export function formaterEuros(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const [entier, decimales = '00'] = Math.abs(n).toFixed(2).split('.')
  const avecEspaces = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const signe = n < 0 ? '-' : ''
  return `${signe}${avecEspaces},${decimales} €`
}
