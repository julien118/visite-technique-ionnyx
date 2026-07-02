// =============================================================
// Domaine « comptes rendus de visite » de l'assistant (lecture seule)
// =============================================================
// Chaîne en trois temps, anti-hallucination, sur la base Supabase de MTC37 :
//   1. analyserQuestionCr : Claude traduit la question en filtres (JSON).
//   2. code PUR : SELECT des rapports + chantiers, filtres client/période/thème,
//      puis BORNAGE. Aucun chiffre/observation inventé ici.
//   3. redigerDepuisFaits (rédacteur partagé) : Claude rédige à partir des FAITS.
//
// ⚠️ MULTI-USER : contrairement à ATG (mono-user, lit TOUS les rapports), on filtre
// par `userId` via un join `chantiers!inner` sur `user_id` → chaque artisan ne voit
// QUE ses propres comptes rendus. LECTURE SEULE STRICTE (que des SELECT).

import { createAdminClient } from '../supabase/admin'
import { redigerDepuisFaits } from './rediger'
import { anthropic, MODELE_CLAUDE } from '../anthropic'
import {
  normaliser,
  jetonsSignificatifs,
  correspondNomSouple,
  faitReferenceClientPrecedent,
} from './matching-nom'
import { blocHistoriquePourAnalyse, type MessageHistorique } from './historique'
import type { RapportContenu } from '../types'

// Plafond du nombre de comptes rendus résumés envoyés au rédacteur.
const LIMITE_LISTE = 15

// ---------- Types ----------

export interface IntentCr {
  intention: 'liste' | 'detail_chantier' | 'recherche_theme' | 'comptage' | 'inconnu'
  client: string | null
  periode: { debut: string | null; fin: string | null } | null
  motsCles: string[] | null
}

interface CompteRendu {
  chantierId: string
  client: string
  dateISO: string | null
  objet: string
  contenu: RapportContenu | null
  pdfUrl: string | null
}

// Forme de la ligne renvoyée par le SELECT rapports + join chantiers (l'embed
// "to-one" peut remonter un objet OU un tableau selon le client PostgREST).
type ChantierJoint = {
  client_nom?: string | null
  client_prenom?: string | null
  date_visite?: string | null
  objet_travaux?: string | null
  user_id?: string | null
}
interface LigneRapport {
  chantier_id: string
  contenu_json: RapportContenu | null
  pdf_url: string | null
  chantiers: ChantierJoint | ChantierJoint[] | null
}

// ---------- 1) Lecture seule des comptes rendus de L'UTILISATEUR ----------

// Récupère les comptes rendus (table rapports) joints à leur chantier, filtrés par
// user_id (join inner sur chantiers). SELECT uniquement. Volumétrie faible : on lit
// puis on filtre en mémoire.
export async function listerComptesRendus(userId: string): Promise<CompteRendu[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('rapports')
    .select('chantier_id, contenu_json, pdf_url, chantiers!inner(client_nom, client_prenom, date_visite, objet_travaux, user_id)')
    .eq('chantiers.user_id', userId)
  if (error) throw new Error(`Supabase /rapports : ${error.message}`)

  return ((data ?? []) as unknown as LigneRapport[]).map((r) => {
    const ch: ChantierJoint = Array.isArray(r.chantiers) ? r.chantiers[0] ?? {} : r.chantiers ?? {}
    const contenu = (r.contenu_json ?? null) as RapportContenu | null
    const nomComplet = `${ch.client_prenom ?? ''} ${ch.client_nom ?? ''}`.trim()
    return {
      chantierId: r.chantier_id,
      client: nomComplet || contenu?.client?.nom || '(client non renseigné)',
      dateISO: (ch.date_visite ?? '').slice(0, 10) || null,
      objet: ch.objet_travaux ?? '',
      contenu,
      pdfUrl: r.pdf_url ?? null,
    }
  })
}

// ---------- 2a) Analyse de la question (Claude -> intent JSON) ----------

function promptAnalyseCr(
  question: string,
  aujourdhui: string,
  historique?: MessageHistorique[] | null,
): string {
  return `Tu analyses une question d'un artisan maçon sur SES comptes rendus de visite de chantier. Tu ne réponds PAS : tu la traduis en filtres structurés.

DATE DU JOUR : ${aujourdhui} (pour interpréter "ce mois-ci", "en mai", "le dernier"...).

QUESTION :
---
${question}
---
${blocHistoriquePourAnalyse(historique)}
Réponds STRICTEMENT en JSON valide (aucun texte autour, pas de markdown), schéma EXACT :
{
  "intention": "liste | detail_chantier | recherche_theme | comptage | inconnu",
  "client": "<nom de client ou de chantier recherché, ou null>",
  "periode": { "debut": "YYYY-MM-DD ou null", "fin": "YYYY-MM-DD ou null" },
  "motsCles": ["<termes techniques recherchés, ex: fissure, humidite, mousse>"]
}

RÈGLES :
- "intention" : "detail_chantier" si la question vise un compte rendu/chantier précis ; "recherche_theme" si elle cherche les chantiers présentant un sujet (fissures, humidité, affaissement, désordre...) ; "liste" pour lister sans thème précis ; "comptage" pour un nombre de comptes rendus/visites ; "inconnu" si hors sujet.
- "client" : uniquement si un client ou un chantier précis est nommé, sinon null.
- "periode" : convertis les expressions relatives en dates absolues à partir de la DATE DU JOUR. Si aucune période, debut et fin à null.
- "motsCles" : la liste des thèmes/termes recherchés pour "recherche_theme", sinon null. Mets les mots au singulier et sans accent si possible.
- N'invente aucun filtre non demandé.`
}

interface IntentCrBrut {
  intention?: string
  client?: string | null
  periode?: { debut?: string | null; fin?: string | null } | null
  motsCles?: unknown
}
function extraireJson(texte: string): IntentCrBrut {
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) throw new Error("Aucun JSON dans la réponse d'analyse CR.")
  return JSON.parse(m[0]) as IntentCrBrut
}

export async function analyserQuestionCr(
  question: string,
  aujourdhui: string,
  historique?: MessageHistorique[] | null,
): Promise<IntentCr> {
  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 400,
    temperature: 0,
    messages: [{ role: 'user', content: promptAnalyseCr(question, aujourdhui, historique) }],
  })
  const texte = rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '') : ''
  const p = extraireJson(texte)
  const motsCles = Array.isArray(p.motsCles)
    ? p.motsCles.map((m: unknown) => String(m)).filter(Boolean)
    : null
  return {
    intention: (p.intention ?? 'inconnu') as IntentCr['intention'],
    client: p.client ?? null,
    periode:
      p.periode && (p.periode.debut || p.periode.fin)
        ? { debut: p.periode.debut ?? null, fin: p.periode.fin ?? null }
        : null,
    motsCles: motsCles && motsCles.length ? motsCles : null,
  }
}

// ---------- 2b) Filtres en code (pur, sur les vraies données) ----------

function correspondClient(cr: CompteRendu, client: string): boolean {
  const b = normaliser(client)
  if (!b) return true
  const cible = normaliser(cr.client)
  const jetons = jetonsSignificatifs(client)
  if (jetons.length === 0) return cible.includes(b) || b.includes(cible)
  return jetons.every((t) => cible.includes(t))
}

function correspondClientSouple(cr: CompteRendu, client: string): boolean {
  return correspondNomSouple(client, cr.client)
}

function dansPeriode(
  cr: CompteRendu,
  periode: { debut: string | null; fin: string | null },
): boolean {
  if (!cr.dateISO) return false
  const { debut, fin } = periode
  return (!debut || cr.dateISO >= debut) && (!fin || cr.dateISO <= fin)
}

function texteRecherche(cr: CompteRendu): string {
  const c = cr.contenu
  const morceaux: string[] = [cr.objet]
  if (c) {
    for (const o of c.observations ?? []) {
      morceaux.push(o.titre, o.description, ...(o.points_vigilance ?? []))
    }
    morceaux.push(c.acces_chantier ?? '', c.notes ?? '')
  }
  return normaliser(morceaux.join(' '))
}

function correspondMotsCles(cr: CompteRendu, motsCles: string[]): boolean {
  const texte = texteRecherche(cr)
  return motsCles.some((m) => {
    const n = normaliser(m)
    return n.length > 0 && texte.includes(n)
  })
}

// ---------- 2c) Bornage : résumé vs contenu complet ----------

function resumeBorne(cr: CompteRendu) {
  const obs = cr.contenu?.observations ?? []
  return {
    client: cr.client,
    date_visite: cr.dateISO,
    objet: cr.objet || null,
    nombre_observations: obs.length,
    titres_observations: obs.map((o) => o.titre),
    points_vigilance: obs.flatMap((o) => o.points_vigilance ?? []),
  }
}

function contenuComplet(cr: CompteRendu) {
  const c = cr.contenu
  return {
    client: cr.client,
    date_visite: cr.dateISO,
    objet: cr.objet || null,
    observations: (c?.observations ?? []).map((o) => ({
      titre: o.titre,
      description: o.description,
      points_vigilance: o.points_vigilance ?? [],
      legendes_photos: (o.photos ?? []).map((p) => p.legende).filter(Boolean),
    })),
    acces_chantier: c?.acces_chantier ?? null,
    duree_estimee: c?.duree_estimee ?? null,
    notes: c?.notes ?? null,
  }
}

// ---------- Données comptes rendus d'UN client (pour le récap, additif) ----------

export async function comptesRendusPourClient(
  nom: string,
  userId: string,
  crPreCharges?: CompteRendu[],
): Promise<{ nombre: number; approchant: boolean; comptesRendus: ReturnType<typeof resumeBorne>[] }> {
  const tous = crPreCharges ?? (await listerComptesRendus(userId))
  const r = (nom ?? '').trim()
  if (!r) return { nombre: 0, approchant: false, comptesRendus: [] }
  let base = tous.filter((cr) => correspondClient(cr, r))
  let approchant = false
  if (base.length === 0) {
    base = tous.filter((cr) => correspondClientSouple(cr, r))
    approchant = base.length > 0
  }
  base = [...base].sort((a, b) => (b.dateISO ?? '').localeCompare(a.dateISO ?? ''))
  return { nombre: base.length, approchant, comptesRendus: base.map(resumeBorne) }
}

// ---------- 3) Orchestration du domaine ----------

export interface ReponseCr {
  reponse: string
  nbComptesRendus: number
  clientResolu: string | null
}

export async function repondreQuestionCr(
  question: string,
  aujourdhui: string,
  userId: string,
  clientContexte?: string | null,
  historique?: MessageHistorique[] | null,
): Promise<ReponseCr> {
  const tous = await listerComptesRendus(userId)
  const intent = await analyserQuestionCr(question, aujourdhui, historique)

  const clientEffectif =
    intent.client ??
    (clientContexte && clientContexte.trim() && faitReferenceClientPrecedent(question)
      ? clientContexte.trim()
      : null)

  let base = tous
  let correspondanceApprochante = false
  if (clientEffectif) {
    const exact = base.filter((cr) => correspondClient(cr, clientEffectif))
    if (exact.length > 0) {
      base = exact
    } else {
      const souple = base.filter((cr) => correspondClientSouple(cr, clientEffectif))
      base = souple
      correspondanceApprochante = souple.length > 0
    }
  }
  if (intent.periode) base = base.filter((cr) => dansPeriode(cr, intent.periode!))
  if (intent.motsCles) base = base.filter((cr) => correspondMotsCles(cr, intent.motsCles!))

  base = [...base].sort((a, b) => (b.dateISO ?? '').localeCompare(a.dateISO ?? ''))

  const filtres = {
    client: clientEffectif,
    periode: intent.periode,
    mots_cles: intent.motsCles,
  }

  if (intent.intention === 'comptage') {
    const faits = {
      mode: 'comptage',
      nombre_de_comptes_rendus: base.length,
      filtres,
      correspondance_approchante: correspondanceApprochante,
    }
    const reponse = await redigerDepuisFaits({ question, sujet: 'comptes rendus de visite', faits, userId })
    return { reponse, nbComptesRendus: base.length, clientResolu: clientEffectif }
  }

  let faits: unknown
  if (base.length === 1) {
    faits = {
      mode: 'compte_rendu_detaille',
      filtres,
      correspondance_approchante: correspondanceApprochante,
      compte_rendu: contenuComplet(base[0]),
    }
  } else {
    const ambiguite = intent.intention === 'detail_chantier' && base.length > 1
    faits = {
      mode: ambiguite ? 'plusieurs_correspondances' : 'resume',
      nombre_de_comptes_rendus: base.length,
      filtres,
      correspondance_approchante: correspondanceApprochante,
      invitation_a_preciser: ambiguite,
      comptes_rendus: base.slice(0, LIMITE_LISTE).map(resumeBorne),
      comptes_rendus_tronques: Math.max(0, base.length - LIMITE_LISTE),
    }
  }

  const reponse = await redigerDepuisFaits({ question, sujet: 'comptes rendus de visite', faits, userId })
  return { reponse, nbComptesRendus: base.length, clientResolu: clientEffectif }
}
