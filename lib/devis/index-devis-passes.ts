// =============================================================
// Index « déjà chiffré » — devis passés d'Hendrix (LECTURE SEULE)
// =============================================================
// Construit, à partir de ses devis ACCEPTÉS + ENVOYÉS, un index exploitable pour
// le matching de typologie : pour chaque devis, ses ouvrages (prix/unité/TVA/desc)
// + des mots-clés. C'est la source du « déjà chiffré » (sa façon réelle de chiffrer
// un chantier similaire). Cache mémoire (TTL long) : la construction expand chaque
// devis, donc on ne la refait pas à chaque requête.

import {
  listerDevisHendrix,
  lireDevisExpandHendrix,
  stripHtml,
  type DevisExpandBrut,
  type LigneDevisBrut,
} from '../costructor'
import { jetonsSignificatifs } from '../assistant/matching-nom'
import { createAdminClient } from '../supabase/admin'
import type { DevisReference, OuvrageReference } from '../types'

// Exécute `fn` sur chaque item avec un PLAFOND de requêtes simultanées (le
// séquentiel + délai était trop lent ; le rate-limit Costructor est absorbé par le
// back-off dans costructorFetch). Préserve l'ordre des résultats.
async function mapConcurrent<T, R>(
  items: T[],
  concurrence: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultats: R[] = new Array(items.length)
  let prochain = 0
  async function worker() {
    for (;;) {
      const i = prochain++
      if (i >= items.length) break
      resultats[i] = await fn(items[i])
    }
  }
  const n = Math.min(Math.max(1, concurrence), items.length || 1)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return resultats
}

// Aplati les lignes produit (les devis d'Hendrix sont plats, mais on gère la
// récursion par sécurité).
function aplatirProduits(
  lines: LigneDevisBrut[] | null | undefined,
  acc: LigneDevisBrut[] = [],
): LigneDevisBrut[] {
  for (const l of lines ?? []) {
    if ((l.type ?? '') === 'product') acc.push(l)
    aplatirProduits(l.lines, acc)
  }
  return acc
}

function produitId(p: LigneDevisBrut['product']): string | null {
  if (!p) return null
  if (typeof p === 'string') return p
  return p.id ?? null
}

// Titre d'un ouvrage : le 1er <strong> de la description (style d'Hendrix), sinon
// la 1re phrase du texte strippé.
function titreOuvrage(html: string | null | undefined): string {
  const h = html ?? ''
  const m = h.match(/<strong>([\s\S]*?)<\/strong>/i)
  if (m) {
    const t = stripHtml(m[1]).slice(0, 80)
    if (t) return t
  }
  const plat = stripHtml(h)
  return (plat.split(/[.:!?]/)[0] || plat).slice(0, 80)
}

// TVA en points de % (10, 20…) depuis taxRate (points de base) ou tax.rate.
function tvaTaux(l: LigneDevisBrut): number | null {
  if (typeof l.taxRate === 'number') return Math.round(l.taxRate / 100)
  if (l.tax && typeof l.tax.rate === 'number') return Math.round(l.tax.rate / 100)
  return null
}

function extraireOuvrages(d: DevisExpandBrut): OuvrageReference[] {
  return aplatirProduits(d.lines)
    .map((l) => ({
      product_id: produitId(l.product),
      titre: titreOuvrage(l.description),
      unite: l.unit?.symbol ?? '',
      prix_vente: typeof l.sellPrice === 'number' ? l.sellPrice / 100 : 0,
      tva_taux: tvaTaux(l),
      description: stripHtml(l.description ?? ''),
    }))
    .filter((o) => o.titre.length > 0)
}

export interface StatsIndex {
  poolSize: number
  expandes: number
  lisibles: number
  references: number
}

const INDEX_TTL_MS = 6 * 60 * 60 * 1000 // 6 h
let cacheIndex: { refs: DevisReference[]; expire: number } | null = null
let dernieresStats: StatsIndex | null = null

export function statsIndex(): StatsIndex | null {
  return dernieresStats
}

// Construit (ou retourne en cache) l'index des devis passés exploitables.
// `max` borne le nombre de devis expandés (coût API) ; `force` ignore le cache.
export async function construireIndexDevisPasses(
  opts: { max?: number; force?: boolean } = {},
): Promise<DevisReference[]> {
  const now = Date.now()
  if (!opts.force && cacheIndex && cacheIndex.expire > now) return cacheIndex.refs

  const max = opts.max ?? 300
  const tous = await listerDevisHendrix()
  const pool = tous
    .filter((q) => q.model !== true && (q.status === 'accepted' || q.sent === true))
    .slice(0, max)

  const refs = (
    await mapConcurrent(pool, 6, async (q) => {
      try {
        const d = await lireDevisExpandHendrix(q.id)
        const ouvrages = extraireOuvrages(d)
        if (ouvrages.length === 0) return null // devis illisible au niveau ligne
        const nom = d.project?.name || d.name || q.name || ''
        const motsCles = Array.from(
          new Set([
            ...jetonsSignificatifs(nom),
            ...ouvrages.flatMap((o) => jetonsSignificatifs(o.titre)),
          ]),
        )
        return {
          id: q.id,
          nom,
          statut: q.status ?? '',
          total_ht: typeof q.subtotal === 'number' ? q.subtotal / 100 : null,
          mots_cles: motsCles,
          ouvrages,
        } as DevisReference
      } catch {
        return null // devis illisible / erreur transitoire : best-effort
      }
    })
  ).filter((r): r is DevisReference => r !== null)

  dernieresStats = { poolSize: pool.length, expandes: pool.length, lisibles: refs.length, references: refs.length }
  cacheIndex = { refs, expire: now + INDEX_TTL_MS }
  return refs
}

// ---------- Persistance en base (table devis_reference) ----------

// Écrit/actualise l'index en base (service_role). Upsert par costructor_id.
export async function persistIndex(refs: DevisReference[]): Promise<void> {
  if (refs.length === 0) return
  const admin = createAdminClient()
  const rows = refs.map((r) => ({
    costructor_id: r.id,
    nom: r.nom,
    statut: r.statut,
    total_ht: r.total_ht,
    mots_cles: r.mots_cles,
    ouvrages: r.ouvrages,
    updated_at: new Date().toISOString(),
  }))
  await admin.from('devis_reference').upsert(rows, { onConflict: 'costructor_id' })
}

// Lit l'index depuis la base (INSTANTANÉ, hors chemin Costructor). Vide si jamais indexé.
export async function chargerIndexReference(): Promise<DevisReference[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('devis_reference')
    .select('costructor_id, nom, statut, total_ht, mots_cles, ouvrages')
  if (error || !data) return []
  return data.map((r) => ({
    id: r.costructor_id as string,
    nom: (r.nom as string) ?? '',
    statut: (r.statut as string) ?? '',
    total_ht: (r.total_ht as number | null) ?? null,
    mots_cles: Array.isArray(r.mots_cles) ? (r.mots_cles as string[]) : [],
    ouvrages: Array.isArray(r.ouvrages) ? (r.ouvrages as OuvrageReference[]) : [],
  }))
}
