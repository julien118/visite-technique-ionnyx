// =============================================================
// Domaine « recap_client » — le « second cerveau » (LECTURE SEULE)
// =============================================================
// Répond à une demande GLOBALE sur un client (« tout sur M. Dupont », « le dossier
// de X ») en RELIANT ses trois sources : coordonnées (clients) + comptes rendus de
// visite + devis passés. Un seul appel Claude, structuré en rubriques, sortie propre.
//
// Réutilise les fonctions data des autres domaines (aucune requête dupliquée) :
//   - chargerFichesClient / trouverFichesClient (coordonnées)
//   - comptesRendusPourClient (comptes rendus)
//   - devisPourClient (devis passés indexés)

import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { faitReferenceClientPrecedent } from './matching-nom'
import { blocContexteArtisan } from './profil-artisan'
import { memoireApprentissage } from './apprentissage'
import { blocReglesSortiePropre, formaterEuros } from './format-sortie'
import type { MessageHistorique } from './historique'
import {
  chargerFichesClient,
  trouverFichesClient,
  trouverFicheClientExacte,
  coordonneesCompletes,
  candidatDepuisFiche,
  analyserQuestionClients,
  type FicheClient,
  type CandidatClient,
} from './domaine-clients'
import { comptesRendusPourClient } from './domaine-comptes-rendus'
import { devisPourClient } from './domaine-devis'

const MAX_CR = 5
const MAX_DEVIS = 10
const LIMITE_HOMONYMES = 15

export interface ReponseRecap {
  reponse: string
  nb: number
  clientResolu: string | null
  candidats?: CandidatClient[]
}

// Rédacteur dédié (3 rubriques). Reprend contexte artisan + mémoire d'apprentissage
// + règles de sortie propre (mêmes garanties que le rédacteur partagé).
async function redigerRecap(args: { question: string; faits: unknown; userId: string }): Promise<string> {
  const contexte = blocContexteArtisan()
  const memoire = await memoireApprentissage(args.userId)
  const prompt = `${contexte}

Tu réponds à une demande GLOBALE sur UN client (son dossier complet), UNIQUEMENT à partir des FAITS ci-dessous (coordonnées + comptes rendus de visite + devis passés). Tu ne calcules rien, tu n'inventes rien.
${memoire ? `\n${memoire}\n` : ''}
QUESTION DE L'ARTISAN :
${args.question}

FAITS (déjà récupérés et calculés par le code) :
${JSON.stringify(args.faits, null, 2)}

STRUCTURE (n'affiche QUE les rubriques qui ont des données) :
- Coordonnées : adresse, téléphone, email si présents ; sinon précise qu'elles ne sont pas renseignées.
- Comptes rendus : pour chacun, la date, l'objet et les points clés ; si "autres" > 0, ajoute « … et N autres ».
- Devis : pour chacun, l'intitulé, le montant HT et le statut ; rappelle le total HT ; si "autres" > 0, ajoute « … et N autres ».

RÈGLES STRICTES :
- N'invente RIEN. Chaque donnée citée doit apparaître dans les FAITS. Ne recalcule aucun montant (ils sont déjà formatés).
- mode = "aucun_nom" : demande poliment de préciser de quel client il s'agit.
- mode = "plusieurs_clients" : indique qu'il y a plusieurs clients pour ce nom et invite à choisir (des boutons sont proposés).
- mode = "aucun" : dis clairement qu'aucune information n'a été trouvée pour ce client.
- "correspondance_approchante" = true : cite le nom EXACT trouvé et demande de confirmer que c'est le bon client.
- Reste factuel, concis et chaleureux.
${blocReglesSortiePropre()}
- Tu es en LECTURE SEULE : tu ne peux rien créer ni modifier.`

  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 1100,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  return rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '').trim() : ''
}

export async function repondreRecapClient(
  question: string,
  userId: string,
  clientContexte?: string | null,
  clientForce?: string | null,
  historique?: MessageHistorique[] | null,
): Promise<ReponseRecap> {
  const fiches = await chargerFichesClient(userId)

  // 1) Résoudre le nom du client.
  let nom: string | null = null
  if (clientForce && clientForce.trim()) {
    nom = clientForce.trim()
  } else {
    const intent = await analyserQuestionClients(question, historique)
    nom =
      intent.client ??
      (clientContexte && clientContexte.trim() && faitReferenceClientPrecedent(question)
        ? clientContexte.trim()
        : null)
  }

  if (!nom) {
    const reponse = await redigerRecap({ question, faits: { mode: 'aucun_nom' }, userId })
    return { reponse, nb: 0, clientResolu: null }
  }

  // 2) Résoudre la/les fiche(s) coordonnées.
  let fiche: FicheClient | null = null
  let approchantNom = false
  if (clientForce && clientForce.trim()) {
    fiche = trouverFicheClientExacte(nom, fiches)
  } else {
    const { fiches: trouves, approchant } = trouverFichesClient(nom, fiches)
    approchantNom = approchant
    if (trouves.length > 1) {
      const candidats = trouves.slice(0, LIMITE_HOMONYMES).map(candidatDepuisFiche)
      const faits = {
        mode: 'plusieurs_clients',
        client_recherche: nom,
        nombre: trouves.length,
        clients: trouves.slice(0, LIMITE_HOMONYMES).map((f) => ({ nom: f.nom, ville: f.ville })),
      }
      const reponse = await redigerRecap({ question, faits, userId })
      return { reponse, nb: trouves.length, clientResolu: nom, candidats }
    }
    fiche = trouves[0] ?? null
  }

  // 3) Rassembler comptes rendus + devis (en parallèle) sur le nom résolu.
  const nomRecherche = fiche ? fiche.nom : nom
  const [cr, devis] = await Promise.all([
    comptesRendusPourClient(nomRecherche, userId),
    devisPourClient(nomRecherche),
  ])

  if (!fiche && cr.nombre === 0 && devis.nombre === 0) {
    const reponse = await redigerRecap({ question, faits: { mode: 'aucun', client_recherche: nom }, userId })
    return { reponse, nb: 0, clientResolu: nom }
  }

  const faits = {
    mode: 'recap_client',
    client_recherche: nom,
    correspondance_approchante: approchantNom || cr.approchant || devis.approchant,
    coordonnees: fiche ? coordonneesCompletes(fiche) : null,
    comptes_rendus: {
      nombre: cr.nombre,
      liste: cr.comptesRendus.slice(0, MAX_CR),
      autres: Math.max(0, cr.nombre - MAX_CR),
    },
    devis: {
      nombre: devis.nombre,
      total_ht: formaterEuros(devis.total_ht),
      liste: devis.devis.slice(0, MAX_DEVIS),
      autres: Math.max(0, devis.nombre - MAX_DEVIS),
    },
  }
  const reponse = await redigerRecap({ question, faits, userId })
  return { reponse, nb: cr.nombre + devis.nombre, clientResolu: nomRecherche }
}
