// =============================================================
// Domaine « clients » de l'assistant (LECTURE SEULE, anti-hallucination)
// =============================================================
// Répond sur l'IDENTITÉ et les COORDONNÉES des clients d'Hendrix (adresse, tel,
// email) et la liste de ses clients. DEUX sources fusionnées :
//   (a) les chantiers de l'app (table chantiers, filtrée par user_id via RLS),
//   (b) les contacts Costructor d'Hendrix (lecture seule).
// Fusion + dédoublonnage par nom normalisé (on enrichit une même personne).
//
// Chaîne : analyse (Claude → JSON) → résolution/filtre EN CODE → rédaction FAITS.
// Homonymes → renvoie des `candidats` cliquables (le widget sait les afficher).

import { createAdminClient } from '../supabase/admin'
import { listerContactsHendrix } from '../costructor'
import { redigerDepuisFaits } from './rediger'
import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { normaliser, jetonsSignificatifs, correspondNomSouple, faitReferenceClientPrecedent } from './matching-nom'
import { blocHistoriquePourAnalyse, type MessageHistorique } from './historique'

const LIMITE_LISTE = 15

// ---------- Types ----------
export interface FicheClient {
  nom: string
  emails: string[]
  telephones: string[]
  adresses: string[]
  ville: string | null
  origine: 'costructor' | 'app'
}

export interface CandidatClient {
  libelle: string
  valeur: string
  ville: string | null
  origine: 'costructor' | 'app'
}

export interface ReponseClients {
  reponse: string
  nb: number
  clientResolu: string | null
  candidats?: CandidatClient[]
}

// ---------- Chargement + fusion des fiches ----------
function villeDepuisAdresse(adresse: string | null | undefined): string | null {
  const a = (adresse ?? '').trim()
  const m = a.match(/\b\d{5}\s+(.+)$/)
  if (m) return m[1].trim()
  return null
}

type LigneChantier = {
  client_prenom?: string | null
  client_nom?: string | null
  client_adresse?: string | null
  client_telephone?: string | null
  client_email?: string | null
}

export async function chargerFichesClient(userId: string): Promise<FicheClient[]> {
  const parNom = new Map<string, FicheClient>()

  function ajouter(f: FicheClient) {
    const cle = normaliser(f.nom)
    if (!cle) return
    const existant = parNom.get(cle)
    if (!existant) {
      parNom.set(cle, { ...f })
      return
    }
    existant.emails = Array.from(new Set([...existant.emails, ...f.emails]))
    existant.telephones = Array.from(new Set([...existant.telephones, ...f.telephones]))
    existant.adresses = Array.from(new Set([...existant.adresses, ...f.adresses]))
    existant.ville = existant.ville ?? f.ville
    if (f.origine === 'costructor') existant.origine = 'costructor'
  }

  // (a) Contacts Costructor d'Hendrix (best-effort : si l'API échoue, on garde l'app).
  try {
    const contacts = await listerContactsHendrix()
    for (const c of contacts) {
      ajouter({
        nom: c.nom,
        emails: c.emails,
        telephones: c.telephones,
        adresses: [],
        ville: null,
        origine: 'costructor',
      })
    }
  } catch {
    // best-effort
  }

  // (b) Chantiers de l'app (identité + coordonnées saisies sur le terrain).
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('chantiers')
      .select('client_prenom, client_nom, client_adresse, client_telephone, client_email')
      .eq('user_id', userId)
    for (const l of (data ?? []) as LigneChantier[]) {
      const nom = `${l.client_prenom ?? ''} ${l.client_nom ?? ''}`.trim()
      if (!nom) continue
      const adresse = (l.client_adresse ?? '').trim()
      ajouter({
        nom,
        emails: (l.client_email ?? '').trim() ? [(l.client_email ?? '').trim()] : [],
        telephones: (l.client_telephone ?? '').trim() ? [(l.client_telephone ?? '').trim()] : [],
        adresses: adresse ? [adresse] : [],
        ville: villeDepuisAdresse(adresse),
        origine: 'app',
      })
    }
  } catch {
    // best-effort
  }

  return Array.from(parNom.values())
}

// ---------- Résolution / filtres (pur, sur les fiches déjà chargées) ----------
export function trouverFichesClient(
  nom: string,
  fiches: FicheClient[],
): { fiches: FicheClient[]; approchant: boolean } {
  const r = (nom ?? '').trim()
  if (!r) return { fiches: [], approchant: false }
  const jetons = jetonsSignificatifs(r)
  const exact = fiches.filter((f) => {
    const cible = normaliser(f.nom)
    if (jetons.length === 0) return cible.includes(normaliser(r))
    return jetons.every((t) => cible.includes(t))
  })
  if (exact.length > 0) return { fiches: exact, approchant: false }
  const souple = fiches.filter((f) => correspondNomSouple(r, f.nom))
  return { fiches: souple, approchant: souple.length > 0 }
}

export function trouverFicheClientExacte(nomCanonique: string, fiches: FicheClient[]): FicheClient | null {
  const cible = normaliser(nomCanonique)
  return fiches.find((f) => normaliser(f.nom) === cible) ?? null
}

export function coordonneesCompletes(f: FicheClient) {
  return {
    nom: f.nom,
    emails: f.emails,
    telephones: f.telephones,
    adresses: f.adresses,
    ville: f.ville,
    origine: f.origine,
  }
}

function resumeContact(f: FicheClient) {
  return {
    nom: f.nom,
    ville: f.ville,
    email: f.emails[0] ?? null,
    telephone: f.telephones[0] ?? null,
    origine: f.origine,
  }
}

export function candidatDepuisFiche(f: FicheClient): CandidatClient {
  return { libelle: f.nom, valeur: f.nom, ville: f.ville, origine: f.origine }
}

// ---------- Analyse (Claude → intent JSON) ----------
function promptAnalyseClients(question: string, historique?: MessageHistorique[] | null): string {
  return `Tu analyses une question d'un artisan maçon sur l'IDENTITÉ / les COORDONNÉES de ses clients (adresse, téléphone, email) ou la liste de ses clients. Tu ne réponds PAS : tu la traduis en filtres.

QUESTION :
---
${question}
---
${blocHistoriquePourAnalyse(historique)}
Réponds STRICTEMENT en JSON valide (aucun texte autour, pas de markdown), schéma EXACT :
{
  "intention": "fiche_client | liste_clients | inconnu",
  "client": "<nom du client recherché, ou null>",
  "ville": "<ville filtrée, ou null>"
}

RÈGLES :
- "fiche_client" : coordonnées d'UN client précis (l'adresse de X, le téléphone de X, la fiche de X).
- "liste_clients" : lister des clients (tous, ou ceux d'une ville).
- "client" : uniquement si un client est nommé, sinon null.
- "ville" : uniquement si une ville est citée, sinon null.
- N'invente aucun filtre non demandé.`
}

interface IntentClientsBrut {
  intention?: string
  client?: string | null
  ville?: string | null
}
function extraireJson(texte: string): IntentClientsBrut {
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) throw new Error("Aucun JSON dans la réponse d'analyse clients.")
  return JSON.parse(m[0]) as IntentClientsBrut
}

export interface IntentClients {
  intention: 'fiche_client' | 'liste_clients' | 'inconnu'
  client: string | null
  ville: string | null
}
export async function analyserQuestionClients(
  question: string,
  historique?: MessageHistorique[] | null,
): Promise<IntentClients> {
  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 300,
    temperature: 0,
    messages: [{ role: 'user', content: promptAnalyseClients(question, historique) }],
  })
  const texte = rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '') : ''
  const p = extraireJson(texte)
  return {
    intention: (p.intention ?? 'inconnu') as IntentClients['intention'],
    client: p.client ?? null,
    ville: p.ville ?? null,
  }
}

// ---------- Orchestration du domaine ----------
export async function repondreQuestionClients(
  question: string,
  userId: string,
  clientContexte?: string | null,
  clientForce?: string | null,
  historique?: MessageHistorique[] | null,
): Promise<ReponseClients> {
  const fiches = await chargerFichesClient(userId)

  // Clic sur un candidat (homonyme levé) → fiche unique garantie.
  if (clientForce && clientForce.trim()) {
    const f = trouverFicheClientExacte(clientForce.trim(), fiches)
    const faits = f
      ? { mode: 'fiche_client', fiche: coordonneesCompletes(f) }
      : { mode: 'aucun', client_recherche: clientForce }
    const reponse = await redigerDepuisFaits({ question, sujet: 'coordonnées clients', faits, userId })
    return { reponse, nb: f ? 1 : 0, clientResolu: f ? f.nom : clientForce }
  }

  const intent = await analyserQuestionClients(question, historique)
  const clientEffectif =
    intent.client ??
    (clientContexte && clientContexte.trim() && faitReferenceClientPrecedent(question)
      ? clientContexte.trim()
      : null)

  const villeNorm = intent.ville ? normaliser(intent.ville) : null

  // Liste de clients (aucun client précis) — éventuellement filtrée par ville.
  if (!clientEffectif) {
    let base = fiches
    if (villeNorm) base = base.filter((f) => normaliser(f.ville ?? '').includes(villeNorm))
    base = [...base].sort((a, b) => a.nom.localeCompare(b.nom))
    const faits = {
      mode: 'liste_clients',
      nombre_de_clients: base.length,
      filtres: { ville: intent.ville },
      clients: base.slice(0, LIMITE_LISTE).map(resumeContact),
      clients_tronques: Math.max(0, base.length - LIMITE_LISTE),
    }
    const reponse = await redigerDepuisFaits({ question, sujet: 'coordonnées clients', faits, userId })
    return { reponse, nb: base.length, clientResolu: null }
  }

  // Client précis : exact → souple.
  const { fiches: trouves, approchant } = trouverFichesClient(clientEffectif, fiches)
  const filtres = villeNorm
    ? trouves.filter((f) => normaliser(f.ville ?? '').includes(villeNorm))
    : trouves

  if (filtres.length === 0) {
    const faits = { mode: 'aucun', client_recherche: clientEffectif, filtres: { ville: intent.ville } }
    const reponse = await redigerDepuisFaits({ question, sujet: 'coordonnées clients', faits, userId })
    return { reponse, nb: 0, clientResolu: clientEffectif }
  }

  if (filtres.length === 1) {
    const faits = {
      mode: 'fiche_client',
      correspondance_approchante: approchant,
      fiche: coordonneesCompletes(filtres[0]),
    }
    const reponse = await redigerDepuisFaits({ question, sujet: 'coordonnées clients', faits, userId })
    return { reponse, nb: 1, clientResolu: filtres[0].nom }
  }

  // Homonymes → invite + candidats cliquables (le code construit les candidats).
  const candidats = filtres.slice(0, LIMITE_LISTE).map(candidatDepuisFiche)
  const faits = {
    mode: 'plusieurs_clients',
    client_recherche: clientEffectif,
    correspondance_approchante: approchant,
    nombre: filtres.length,
    clients: filtres.slice(0, LIMITE_LISTE).map(resumeContact),
    invitation_a_preciser: true,
  }
  const reponse = await redigerDepuisFaits({ question, sujet: 'coordonnées clients', faits, userId })
  return { reponse, nb: filtres.length, clientResolu: clientEffectif, candidats }
}
