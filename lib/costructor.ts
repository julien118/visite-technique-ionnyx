// =============================================================
// SDK Costructor maison (MTC37) — fetch + Bearer
// =============================================================
// API : https://api.costructor.co/external/v1
// Auth : Authorization: Bearer <clé>
// Montants : ENTIERS EN CENTIMES (4500 = 45,00 €)
// Réponses : { data: …, metadata: … }
// Méta-params préfixés « _ » (sinon ignorés / plafonnés à 10) : _limit, _expand…
//
// PRODUCTION : tout se passe sur l'espace d'HENDRIX (MTC37). LECTURE (catalogue,
// bibliothèque, articles, devis passés, contacts) via cleHendrix() ; ÉCRITURE
// (contacts + brouillons de devis) via assertCompteCible(), qui vise Hendrix par
// défaut (cf lib/costructor-compte.ts). Le compte de Julien ne sert plus que de bac
// à sable de test si l'on force COSTRUCTOR_CIBLE=julien.

import { cleHendrix, assertCompteCible } from './costructor-compte'
import { fetchRetry } from './fetch-retry'
import type { ArticleRemplacable, SectionDevis } from './types'

const BASE_URL =
  process.env.COSTRUCTOR_API_BASE_URL || 'https://api.costructor.co/external/v1'

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- Unités (IDs GLOBAUX — validés sur Hendrix ET Julien) ----------
export const UNIT_M2 = 'unit_01fvj2wadbh7qc1784z1es0nke' // m²
export const UNIT_ML = 'unit_01fvj2wafhw41w7hpaeb3ywfg5' // ml
export const UNIT_U = 'unit_01fvj2wa9fgmx3th3na873ccws' // u
export const UNIT_M3 = 'unit_01fvj2wahmvbmnf8y0czmqjjep' // m³
export const UNIT_ENS = 'unit_01fvj2waghdkq11qjba76hk2dt' // ens
export const UNIT_FORFAIT = UNIT_U

export function uniteVersCostructorId(unite: string): string {
  const u = unite.toLowerCase().trim()
  if (u === 'm²' || u === 'm2') return UNIT_M2
  if (u === 'ml') return UNIT_ML
  if (u === 'm³' || u === 'm3') return UNIT_M3
  if (u === 'u' || u === 'unité' || u === 'unite' || u === 'pièce' || u === 'piece') return UNIT_U
  if (u === 'ens' || u === 'ensemble' || u === 'forfait' || u === 'fft') return UNIT_ENS
  return UNIT_FORFAIT
}

// ---------- HTML / montants ----------
function decoderEntitesHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

// Strippe les balises HTML puis décode les entités. Source unique de nettoyage.
export function stripHtml(s: string): string {
  return decoderEntitesHtml(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function eurosVersCentimes(euros: number): number {
  return Math.round(euros * 100)
}

// Taux en points de % (10) → points de base attendus par Costructor (1000 = 10 %).
export function tauxVersPointsDeBase(tvaTaux: number): number {
  return Math.round(tvaTaux * 100)
}

// ---------- Wrapper fetch (GET par défaut) ----------
// Robustesse réseau : `fetchRetry` (timeout + retry 5xx). Costructor RATE-LIMITE
// (429, sans en-tête Retry-After exposé) → back-off croissant dédié par-dessus.
async function costructorFetch<T>(path: string, cle: string, init: RequestInit = {}): Promise<T> {
  if (!cle) throw new Error('Clé Costructor manquante.')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cle}`,
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  let res: Response | null = null
  for (let i = 0; i < 5; i++) {
    // Timeout large (30 s) : /contacts peut prendre 8-11 s (Costructor renvoie TOUS
    // les contacts) ; un timeout trop court annulait + réessayait → ~45 s puis 502.
    // 1 seul essai réseau (pas de re-POST qui dupliquerait un devis).
    res = await fetchRetry(`${BASE_URL}${path}`, { ...init, headers }, { retries: 1, timeoutMs: 30000 })
    if (res.status !== 429) break
    const ra = Number(res.headers.get('retry-after')) || 0
    await dormir((ra ? ra * 1000 : 0) + 2500 * (i + 1)) // back-off croissant
  }
  if (!res || !res.ok) {
    const corps = res ? await res.text() : ''
    throw new Error(`Costructor ${res?.status ?? '???'} sur ${path} : ${corps.slice(0, 300)}`)
  }
  const json = (await res.json()) as { data?: T } & T
  return json.data !== undefined ? (json.data as T) : (json as T)
}

// ---------- Catalogue (bibliothèque d'ouvrages d'Hendrix) ----------
interface ProduitBrut {
  id: string
  type?: string
  name?: string
  reference?: string | null
  nickname?: string | null
  sellPrice?: number | null
  unit?: { id?: string; symbol?: string } | null
  uses?: number | null
}

// Libellé propre : le `name` d'Hendrix colle souvent titre + description. On garde
// la 1re « phrase » (jusqu'à la 1re minuscule qui suit une majuscule longue, sinon
// la 1re ligne), à défaut la `reference`/`nickname`. Best-effort, jamais vide.
function libellePropre(p: ProduitBrut): string {
  const ref = (p.reference ?? '').trim()
  const nom = stripHtml(p.name ?? '')
  if (nom) {
    // Coupe au 1er passage MAJ→minuscule prolongée (titre collé à la description).
    const m = nom.match(/^([A-ZÀ-ÖØ-Þ0-9'’ .,/()-]{3,}?)(?=[A-ZÀ-ÖØ-Þ]?[a-zà-öø-ÿ])/)
    const tete = (m?.[1] ?? nom).trim()
    if (tete.length >= 3) return tete.slice(0, 90)
    return nom.slice(0, 90)
  }
  return ref || (p.nickname ?? '').trim() || 'Ouvrage'
}

function normaliserNom(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

const BIBLIO_TTL_MS = 5 * 60 * 1000
const cacheBiblio = new Map<string, { articles: ArticleRemplacable[]; expire: number }>()

// LECTURE SEULE du catalogue d'Hendrix (GET /products). Garde les ouvrages
// exploitables (prix > 0 + unité), nettoie le libellé, dédoublonne par nom (uses
// le + élevé). Cache mémoire TTL court.
export async function listerArticlesBibliotheque(): Promise<ArticleRemplacable[]> {
  const maintenant = Date.now()
  const enCache = cacheBiblio.get('hendrix')
  if (enCache && enCache.expire > maintenant) return enCache.articles

  const bruts = await costructorFetch<ProduitBrut[]>('/products?_limit=5000', cleHendrix())
  const utilisables = bruts
    .filter((p) => p.type !== 'text')
    .filter((p) => typeof p.sellPrice === 'number' && p.sellPrice > 0)
    .filter((p) => !!p.unit?.symbol)
    .map((p) => ({
      costructor_article_id: p.id,
      libelle: libellePropre(p),
      unite: p.unit!.symbol as string,
      prix_vente: (p.sellPrice as number) / 100,
      description_source: stripHtml(p.name ?? ''),
      uses: p.uses ?? 0,
    }))

  const parNom = new Map<string, (typeof utilisables)[number]>()
  for (const a of utilisables) {
    const cle = normaliserNom(a.libelle)
    const existant = parNom.get(cle)
    if (!existant || (a.uses ?? 0) > (existant.uses ?? 0)) parNom.set(cle, a)
  }
  const articles = Array.from(parNom.values()).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))

  cacheBiblio.set('hendrix', { articles, expire: maintenant + BIBLIO_TTL_MS })
  return articles
}

// ---------- Taxes (propres au compte → on passe la clé du compte voulu) ----------
export interface TaxeCostructor {
  id: string
  rate: number // points de base (1000 = 10 %)
  name: string
}

export async function listerTaxes(cle: string): Promise<TaxeCostructor[]> {
  const bruts = await costructorFetch<Array<{ id: string; rate?: number | null; name?: string | null }>>(
    '/taxes?_limit=50',
    cle,
  )
  return bruts.map((t) => ({ id: t.id, rate: t.rate ?? 0, name: t.name ?? '' }))
}

// Id de taxe du compte pour un taux en points de % (10 → cherche rate 1000).
export async function taxeIdPourTaux(tauxPourcent: number, cle: string): Promise<string | null> {
  const cible = tauxVersPointsDeBase(tauxPourcent)
  const taxes = await listerTaxes(cle)
  return taxes.find((t) => t.rate === cible)?.id ?? null
}

// ---------- Devis (liste + détail) — LECTURE SEULE compte d'Hendrix ----------
export interface DevisListItem {
  id: string
  status?: string | null
  sent?: boolean | null
  model?: boolean | null
  name?: string | null
  subtotal?: number | null // centimes
  project?: { name?: string | null } | null
}

// Forme d'une ligne de devis renvoyée par ?_expand=lines (partielle).
export interface LigneDevisBrut {
  type?: string | null
  productType?: string | null
  description?: string | null
  product?: { id?: string | null } | string | null
  quantity?: number | null
  sellPrice?: number | null // centimes
  unit?: { id?: string | null; symbol?: string | null } | null
  taxRate?: number | null // points de base
  tax?: { id?: string | null; rate?: number | null } | null
  lines?: LigneDevisBrut[] | null
}

export interface DevisExpandBrut extends DevisListItem {
  lines?: LigneDevisBrut[] | null
}

export async function listerDevisHendrix(): Promise<DevisListItem[]> {
  return costructorFetch<DevisListItem[]>('/quotes?_limit=1000', cleHendrix())
}

export async function lireDevisExpandHendrix(id: string): Promise<DevisExpandBrut> {
  return costructorFetch<DevisExpandBrut>(`/quotes/${id}?_expand=lines`, cleHendrix())
}

// =============================================================
// ÉCRITURE — compte CIBLE (HENDRIX / MTC37 par défaut depuis la bascule prod).
// Toute fonction d'écriture passe par assertCompteCible() (cf costructor-compte).
// =============================================================

// ---------- Contacts (recherche + création sur le compte cible) ----------
interface ContactBrut {
  id: string
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  email?: string | null
  phone?: string | null
  emails?: Array<{ email?: string | null; primary?: boolean }> | null
  phones?: Array<{ phone?: string | null; primary?: boolean }> | null
}

function normaliserEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}
// FR : garde les 9 derniers chiffres (comparaison robuste aux préfixes/espaces).
function normaliserTelephone(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').slice(-9)
}
// Best-effort parse "7 Rue X 41100 Vendôme" → { street, zip, city }.
function parseAdresseFr(adresse: string | null | undefined): { street: string; zip: string; city: string } {
  const a = (adresse ?? '').trim()
  if (!a) return { street: '', zip: '', city: '' }
  const m = a.match(/^(.+?)\s+(\d{5})\s+(.+)$/)
  if (m) return { street: m[1].trim(), zip: m[2], city: m[3].trim() }
  return { street: a, zip: '', city: '' }
}

export interface RechercheContactInput {
  client_nom: string
  client_prenom?: string | null
  client_email?: string | null
  client_telephone?: string | null
  client_adresse?: string | null
}

// Cache mémoire des contacts du compte cible : GET /contacts renvoie TOUS les
// contacts (~8-11 s sur le compte de Julien). On évite de recharger cette liste à
// chaque envoi (TTL 5 min) — c'était la cause des pushs à ~47 s. Un contact créé
// est ajouté au cache pour être retrouvé sans recharger.
const CONTACTS_TTL_MS = 5 * 60 * 1000
const cacheContacts = new Map<string, { contacts: ContactBrut[]; expire: number }>()
function cleContacts(cle: string): string {
  return cle.slice(-8) || 'sans-cle'
}
async function listerContactsCache(cle: string): Promise<ContactBrut[]> {
  const k = cleContacts(cle)
  const now = Date.now()
  const enCache = cacheContacts.get(k)
  if (enCache && enCache.expire > now) return enCache.contacts
  const contacts = await costructorFetch<ContactBrut[]>('/contacts?_limit=1000', cle)
  cacheContacts.set(k, { contacts, expire: now + CONTACTS_TTL_MS })
  return contacts
}

// ---------- Contacts d'Hendrix — LECTURE SEULE (assistant « clients »/« récap ») ----------
// Fiche contact nettoyée exposée à l'assistant. AUCUNE écriture : on lit l'espace
// d'Hendrix via sa clé (cleHendrix), pas d'assertCompteCible.
export interface ContactHendrix {
  id: string
  nom: string
  emails: string[]
  telephones: string[]
  societe: string | null
}

export async function listerContactsHendrix(): Promise<ContactHendrix[]> {
  const bruts = await listerContactsCache(cleHendrix())
  return bruts
    .map((c) => {
      const nom = (
        c.fullName ||
        `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() ||
        c.companyName ||
        ''
      ).trim()
      const emails = Array.from(
        new Set(
          [c.email ?? '', ...(c.emails ?? []).map((e) => e.email ?? '')]
            .map((e) => e.trim())
            .filter(Boolean),
        ),
      )
      const telephones = Array.from(
        new Set(
          [c.phone ?? '', ...(c.phones ?? []).map((p) => p.phone ?? '')]
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      )
      return { id: c.id, nom, emails, telephones, societe: c.companyName?.trim() || null }
    })
    .filter((c) => c.nom.length > 0)
}

// Cherche un contact par email exact > téléphone normalisé (signaux forts), sinon
// le CRÉE sur le compte cible. Pas de fusion par nom seul (risque d'homonymes).
export async function trouverOuCreerContact(input: RechercheContactInput): Promise<string> {
  const cle = assertCompteCible()
  const contacts = await listerContactsCache(cle)

  const emailNorm = normaliserEmail(input.client_email)
  if (emailNorm) {
    const m = contacts.find(
      (c) =>
        normaliserEmail(c.email) === emailNorm ||
        (c.emails ?? []).some((e) => normaliserEmail(e.email) === emailNorm),
    )
    if (m) return m.id
  }
  const telNorm = normaliserTelephone(input.client_telephone)
  if (telNorm.length >= 9) {
    const m = contacts.find(
      (c) =>
        normaliserTelephone(c.phone) === telNorm ||
        (c.phones ?? []).some((p) => normaliserTelephone(p.phone) === telNorm),
    )
    if (m) return m.id
  }

  // Création (écriture protégée).
  const { street, zip, city } = parseAdresseFr(input.client_adresse)
  const body: Record<string, unknown> = {
    type: 'client',
    legalStatus: 'individual',
    firstName: (input.client_prenom ?? '').trim(),
    lastName: input.client_nom.trim() || 'Client',
  }
  if (input.client_email?.trim()) body.emails = [{ email: input.client_email.trim(), primary: true }]
  const tel = (input.client_telephone ?? '').replace(/\D/g, '')
  if (tel) body.phones = [{ phone: tel, primary: true }]
  if (street || city || zip) {
    body.addresses = [{ address: { street, city, postal_code: zip, country: 'FR' }, primary: true }]
  }
  const cree = await costructorFetch<{ id: string }>('/contacts', cle, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  // Ajoute le contact créé au cache (retrouvé sans recharger aux prochains envois).
  const enCache = cacheContacts.get(cleContacts(cle))
  if (enCache) {
    enCache.contacts.push({
      id: cree.id,
      firstName: (input.client_prenom ?? '').trim(),
      lastName: input.client_nom.trim(),
      email: input.client_email ?? null,
      phone: input.client_telephone ?? null,
    })
  }
  return cree.id
}

// ---------- Devis : push en LIGNES LIBRES (sans product id) ----------
// Validé : Costructor accepte des lignes type:'product' sans champ `product`.
// Description = titre <strong> + description technique (paragraphes en <br><br>).
function ligneLibre(article: SectionDevis['articles'][number], taxRate: number) {
  const desc = (article.description_technique ?? '').trim()
  let full: string
  if (desc && desc !== article.libelle) {
    const corps = desc
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join('<br><br>')
      .replace(/\n/g, '<br>')
    full = `<strong>${article.libelle}</strong><br><br>${corps}`
  } else {
    full = `<strong>${article.libelle}</strong>`
  }
  return {
    type: 'product' as const,
    description: full,
    quantity: article.quantite as number,
    sellPrice: eurosVersCentimes(article.prix_vente),
    unit: uniteVersCostructorId(article.unite),
    ...(taxRate > 0 ? { taxRate } : {}),
  }
}

export interface ResultatPush {
  id: string
  subtotal: number | null
}

// Construit le devis (groupes = phases, lignes libres) et le POST sur le compte
// cible. N'émet que les articles avec quantité > 0 ; saute les sections vides.
export async function pousserDevisLignesLibres(args: {
  contactId: string
  sections: SectionDevis[]
  tvaTaux: number
  nom?: string
  description?: string
  preVisitAt?: string
}): Promise<ResultatPush> {
  const cle = assertCompteCible()
  const taxRate = tauxVersPointsDeBase(args.tvaTaux)
  const lines: unknown[] = []
  for (const section of args.sections) {
    const arts = section.articles.filter((a) => a.quantite != null && a.quantite > 0)
    if (arts.length === 0) continue
    lines.push({ type: 'group', description: section.nom, lines: arts.map((a) => ligneLibre(a, taxRate)) })
  }
  if (lines.length === 0) throw new Error('Aucune ligne chiffrée à pousser (saisissez des quantités).')

  const payload: Record<string, unknown> = {
    customer: args.contactId,
    lines,
    ...(args.nom?.trim() ? { name: args.nom.trim() } : {}),
    ...(args.description?.trim() ? { description: args.description.trim() } : {}),
    ...(args.preVisitAt ? { preVisitAt: args.preVisitAt } : {}),
  }
  const res = await costructorFetch<{ id: string; subtotal?: number | null }>('/quotes', cle, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { id: res.id, subtotal: res.subtotal ?? null }
}

// Supprime un brouillon (idempotence du re-push). Tolère l'échec.
export async function supprimerDevis(quoteId: string): Promise<void> {
  const cle = assertCompteCible()
  try {
    await fetchRetry(`${BASE_URL}/quotes/${quoteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
    })
  } catch {
    // ignore : nettoyage best-effort
  }
}
