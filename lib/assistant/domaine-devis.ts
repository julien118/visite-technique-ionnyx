// =============================================================
// Domaine « devis » de l'assistant (LECTURE SEULE, anti-hallucination)
// =============================================================
// Répond aux questions sur les devis passés d'Hendrix : montants, plus gros devis,
// total/moyenne, devis d'un client, typologie de travaux chiffrée.
//
// Source = l'INDEX des devis passés (table devis_reference, déjà construite pour le
// moteur de devis) : lecture INSTANTANÉE, pas d'appel Costructor sur le chemin de
// réponse. Chaîne en 3 temps :
//   1. analyserQuestionDevis : Claude → filtres JSON (aucun calcul).
//   2. code PUR : charge l'index, filtre (client/mots-clés), calcule les AGRÉGATS.
//   3. redigerDepuisFaits : Claude rédige à partir des FAITS (montants déjà formatés).
//
// Limite assumée : l'index n'a pas de date → pas de filtre par période (on le dit).
// Pool = devis ACCEPTÉS + ENVOYÉS d'Hendrix (les devis réels, pas les brouillons).

import { chargerIndexReference, construireIndexDevisPasses } from '../devis/index-devis-passes'
import { redigerDepuisFaits } from './rediger'
import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { normaliser, jetonsSignificatifs, correspondNomSouple, faitReferenceClientPrecedent } from './matching-nom'
import { blocHistoriquePourAnalyse, type MessageHistorique } from './historique'
import { formaterEuros } from './format-sortie'
import type { DevisReference } from '../types'

const LIMITE_LISTE = 20

// ---------- Types ----------
export interface IntentDevis {
  intention: 'liste_client' | 'agregat' | 'top_montant' | 'comptage' | 'liste_generale' | 'inconnu'
  client: string | null
  motsCles: string[] | null
  agregat: 'somme' | 'moyenne' | 'max' | 'min' | 'compte' | null
  limite: number | null
}

export interface ReponseDevis {
  reponse: string
  nb: number
  clientResolu: string | null
}

// ---------- 1) Analyse (Claude → intent JSON) ----------
function promptAnalyseDevis(question: string, historique?: MessageHistorique[] | null): string {
  return `Tu analyses une question d'un artisan maçon sur SES devis passés. Tu ne réponds PAS : tu la traduis en filtres structurés.

QUESTION :
---
${question}
---
${blocHistoriquePourAnalyse(historique)}
Réponds STRICTEMENT en JSON valide (aucun texte autour, pas de markdown), schéma EXACT :
{
  "intention": "liste_client | agregat | top_montant | comptage | liste_generale | inconnu",
  "client": "<nom du client concerné, ou null>",
  "motsCles": ["<termes de typologie de travaux, ex: reprise, fissure, dallage, mur, enduit>"],
  "agregat": "somme | moyenne | max | min | compte | null",
  "limite": <nombre entier ou null>
}

RÈGLES :
- "intention" : "liste_client" (les devis d'un client précis), "agregat" (un total/une moyenne/un max/un min de montants), "top_montant" (les plus gros/petits devis, éventuellement limités à N), "comptage" (combien de devis), "liste_generale" (lister sans client précis), "inconnu" si hors sujet.
- "client" : uniquement si un client est nommé, sinon null.
- "motsCles" : les termes de travaux recherchés (au singulier, sans accent si possible), sinon [].
- "agregat" : "somme" pour un total, "moyenne" pour un prix moyen, "max"/"min" pour le plus gros/petit montant, "compte" pour un nombre, sinon null.
- "limite" : le N demandé ("mes 3 plus gros devis" => 3), sinon null.
- N'invente aucun filtre non demandé.`
}

interface IntentDevisBrut {
  intention?: string
  client?: string | null
  motsCles?: unknown
  agregat?: string | null
  limite?: unknown
}
function extraireJson(texte: string): IntentDevisBrut {
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) throw new Error("Aucun JSON dans la réponse d'analyse devis.")
  return JSON.parse(m[0]) as IntentDevisBrut
}

export async function analyserQuestionDevis(
  question: string,
  historique?: MessageHistorique[] | null,
): Promise<IntentDevis> {
  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 400,
    temperature: 0,
    messages: [{ role: 'user', content: promptAnalyseDevis(question, historique) }],
  })
  const texte = rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '') : ''
  const p = extraireJson(texte)
  const motsCles = Array.isArray(p.motsCles) ? p.motsCles.map((m) => String(m)).filter(Boolean) : null
  const agregat = ['somme', 'moyenne', 'max', 'min', 'compte'].includes(String(p.agregat))
    ? (p.agregat as IntentDevis['agregat'])
    : null
  const limiteNum = Number(p.limite)
  return {
    intention: (p.intention ?? 'inconnu') as IntentDevis['intention'],
    client: p.client ?? null,
    motsCles: motsCles && motsCles.length ? motsCles : null,
    agregat,
    limite: Number.isFinite(limiteNum) && limiteNum > 0 ? Math.floor(limiteNum) : null,
  }
}

// ---------- 2) Code pur : index + filtres + agrégats ----------
async function chargerIndex(): Promise<DevisReference[]> {
  const idx = await chargerIndexReference()
  if (idx.length > 0) return idx
  // Repli rare (index jamais construit) : build borné, best-effort.
  try {
    return await construireIndexDevisPasses({ max: 60 })
  } catch {
    return []
  }
}

function motsRef(ref: DevisReference): string[] {
  return ref.mots_cles && ref.mots_cles.length ? ref.mots_cles : jetonsSignificatifs(ref.nom)
}

function correspondClientExact(ref: DevisReference, client: string): boolean {
  const jetons = jetonsSignificatifs(client)
  if (jetons.length === 0) return false
  const cible = new Set(motsRef(ref))
  const nomNorm = normaliser(ref.nom)
  return jetons.every((t) => cible.has(t) || nomNorm.includes(t))
}

function correspondClientSouple(ref: DevisReference, client: string): boolean {
  return correspondNomSouple(client, ref.nom) || correspondNomSouple(client, motsRef(ref).join(' '))
}

function correspondMotsCles(ref: DevisReference, motsCles: string[]): boolean {
  const cible = new Set(motsRef(ref))
  const titres = normaliser(ref.ouvrages.map((o) => o.titre).join(' '))
  return motsCles.some((m) => {
    const jetons = jetonsSignificatifs(m)
    return jetons.some((t) => cible.has(t) || titres.includes(t))
  })
}

function ligneDevis(ref: DevisReference) {
  return {
    nom: ref.nom || '(sans intitulé)',
    montant_ht: formaterEuros(ref.total_ht),
    statut: ref.statut || null,
    nombre_ouvrages: ref.ouvrages.length,
  }
}

// Filtre client (exact → souple) partagé avec le récap.
export interface DevisClientResultat {
  nombre: number
  approchant: boolean
  total_ht: number | null
  devis: ReturnType<typeof ligneDevis>[]
}

function filtrerParClient(refs: DevisReference[], client: string): { base: DevisReference[]; approchant: boolean } {
  const exact = refs.filter((r) => correspondClientExact(r, client))
  if (exact.length > 0) return { base: exact, approchant: false }
  const souple = refs.filter((r) => correspondClientSouple(r, client))
  return { base: souple, approchant: souple.length > 0 }
}

export async function devisPourClient(nom: string): Promise<DevisClientResultat> {
  const r = (nom ?? '').trim()
  if (!r) return { nombre: 0, approchant: false, total_ht: null, devis: [] }
  const refs = await chargerIndex()
  const { base, approchant } = filtrerParClient(refs, r)
  const tri = [...base].sort((a, b) => (b.total_ht ?? 0) - (a.total_ht ?? 0))
  const montants = tri.map((x) => x.total_ht).filter((n): n is number => typeof n === 'number')
  const total = montants.length ? montants.reduce((a, b) => a + b, 0) : null
  return { nombre: tri.length, approchant, total_ht: total, devis: tri.map(ligneDevis) }
}

// ---------- 3) Orchestration du domaine ----------
export async function repondreQuestionDevis(
  question: string,
  userId: string,
  clientContexte?: string | null,
  historique?: MessageHistorique[] | null,
): Promise<ReponseDevis> {
  const intent = await analyserQuestionDevis(question, historique)
  const refs = await chargerIndex()

  const clientEffectif =
    intent.client ??
    (clientContexte && clientContexte.trim() && faitReferenceClientPrecedent(question)
      ? clientContexte.trim()
      : null)

  let base = refs
  let approchant = false
  if (clientEffectif) {
    const r = filtrerParClient(refs, clientEffectif)
    base = r.base
    approchant = r.approchant
  }
  if (intent.motsCles) base = base.filter((ref) => correspondMotsCles(ref, intent.motsCles!))

  base = [...base].sort((a, b) => (b.total_ht ?? 0) - (a.total_ht ?? 0))

  // Agrégat calculé EN CODE (jamais par le modèle).
  const montants = base.map((x) => x.total_ht).filter((n): n is number => typeof n === 'number')
  let agregat: { type: string; valeur: string | null } | null = null
  if (intent.agregat === 'compte') {
    agregat = { type: 'compte', valeur: String(base.length) }
  } else if (intent.agregat && montants.length) {
    const somme = montants.reduce((a, b) => a + b, 0)
    const valeur =
      intent.agregat === 'somme'
        ? somme
        : intent.agregat === 'moyenne'
          ? somme / montants.length
          : intent.agregat === 'max'
            ? Math.max(...montants)
            : Math.min(...montants)
    agregat = { type: intent.agregat, valeur: formaterEuros(valeur) }
  }

  const limiteAffichage =
    intent.intention === 'top_montant' && intent.limite ? intent.limite : LIMITE_LISTE

  const faits = {
    mode: intent.intention,
    nombre_de_devis: base.length,
    correspondance_approchante: approchant,
    filtres: { client: clientEffectif, mots_cles: intent.motsCles },
    periode_non_supportee: true, // rappel : l'index n'a pas de date → pas de filtre période
    agregat,
    devis: base.slice(0, limiteAffichage).map(ligneDevis),
    devis_tronques: Math.max(0, base.length - limiteAffichage),
  }

  const reponse = await redigerDepuisFaits({ question, sujet: 'devis passés', faits, userId })
  return { reponse, nb: base.length, clientResolu: clientEffectif }
}
