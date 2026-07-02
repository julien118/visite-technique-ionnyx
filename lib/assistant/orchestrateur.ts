// =============================================================
// Orchestrateur de l'assistant : aiguille puis délègue au domaine
// =============================================================
// Point d'entrée unique appelé par /api/assistant-devis. Il aiguille la question
// vers un domaine, puis délègue.
//
// Domaines branchés côté données (LECTURE SEULE stricte, anti-hallucination) :
//   - comptes_rendus : rapports de visite (Supabase, filtré user_id)
//   - devis          : devis passés d'Hendrix (index Costructor, lecture seule)
//   - clients        : coordonnées (chantiers app + contacts Costructor d'Hendrix)
//   - recap_client   : « second cerveau » — agrège coordonnées + CR + devis
// Un clic sur un candidat (homonyme) est routé directement via clientForce/domaineForce.

import { aiguiller, type DomaineAssistant } from './aiguilleur'
import { repondreQuestionCr } from './domaine-comptes-rendus'
import { repondreQuestionDevis } from './domaine-devis'
import { repondreQuestionClients, type CandidatClient } from './domaine-clients'
import { repondreRecapClient } from './domaine-recap'
import type { MessageHistorique } from './historique'

export interface ReponseOrchestrateur {
  reponse: string
  domaine: DomaineAssistant
  nb?: number // nombre d'éléments pris en compte (CR, devis, clients)
  clientContexte?: string | null
  // Candidats cliquables (homonymes) — domaines clients / recap_client.
  candidats?: CandidatClient[]
}

// Contexte de conversation transmis par le frontend (serveur stateless).
export interface ContexteConversation {
  userId: string // requis : isolation multi-user (chaque artisan ne voit que ses données)
  dernierClient?: string | null
  clientForce?: string | null
  domaineForce?: DomaineAssistant | null
  historique?: MessageHistorique[] | null
}

const MESSAGE_INCONNU =
  "Je peux vous renseigner sur vos comptes rendus de visite, vos devis passés et vos clients (coordonnées, dossier complet). Posez-moi une question, par exemple : « qu'avait-on noté chez M. Dupont ? », « mes 3 plus gros devis » ou « tout sur M. Dupont »."

export async function repondreAssistant(
  question: string,
  aujourdhui: string,
  contexte: ContexteConversation,
): Promise<ReponseOrchestrateur> {
  const clientContexte = contexte.dernierClient ?? null
  const historique = contexte.historique ?? null
  const userId = contexte.userId
  const clientForce = contexte.clientForce ?? null
  const domaineForce = contexte.domaineForce ?? null

  // Clic sur un candidat (homonyme levé) → route directe vers son domaine, sans
  // ré-aiguiller : la demande vise déjà un client précis.
  const domaine: DomaineAssistant =
    clientForce && domaineForce ? domaineForce : await aiguiller(question, clientContexte, historique)

  if (domaine === 'comptes_rendus') {
    const { reponse, nbComptesRendus, clientResolu } = await repondreQuestionCr(
      question,
      aujourdhui,
      userId,
      clientContexte,
      historique,
    )
    return { reponse, domaine, nb: nbComptesRendus, clientContexte: clientResolu }
  }

  if (domaine === 'devis') {
    const { reponse, nb, clientResolu } = await repondreQuestionDevis(
      question,
      userId,
      clientContexte,
      historique,
    )
    return { reponse, domaine, nb, clientContexte: clientResolu }
  }

  if (domaine === 'clients') {
    const { reponse, nb, clientResolu, candidats } = await repondreQuestionClients(
      question,
      userId,
      clientContexte,
      clientForce,
      historique,
    )
    return { reponse, domaine, nb, clientContexte: clientResolu, candidats }
  }

  if (domaine === 'recap_client') {
    const { reponse, nb, clientResolu, candidats } = await repondreRecapClient(
      question,
      userId,
      clientContexte,
      clientForce,
      historique,
    )
    return { reponse, domaine, nb, clientContexte: clientResolu, candidats }
  }

  // inconnu / repli : on préserve le contexte courant (question hors sujet).
  return { reponse: MESSAGE_INCONNU, domaine: 'inconnu', clientContexte }
}
