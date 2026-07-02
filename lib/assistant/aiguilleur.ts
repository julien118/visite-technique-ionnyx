// =============================================================
// Aiguilleur de domaine de l'assistant (étape 0)
// =============================================================
// Appel Claude léger et isolé : il ne répond PAS à la question, il la RANGE dans
// un domaine, pour que l'orchestrateur aille chercher la bonne donnée au bon
// endroit. La chaîne anti-hallucination reste propre à chaque domaine.

import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { blocHistoriquePourAiguillage, type MessageHistorique } from './historique'

export type DomaineAssistant = 'devis' | 'comptes_rendus' | 'clients' | 'recap_client' | 'inconnu'

// Domaines reconnus par l'aiguilleur. (En Phase 2, seul "comptes_rendus" est
// réellement branché côté données ; devis/clients/recap répondent un repli propre.)
const DOMAINES_CONNUS = new Set<DomaineAssistant>(['devis', 'comptes_rendus', 'clients', 'recap_client'])

function promptAiguilleur(
  question: string,
  clientContexte?: string | null,
  historique?: MessageHistorique[] | null,
): string {
  const ctx = (clientContexte ?? '').trim()
    ? `\nCONTEXTE DE CONVERSATION : le dernier client évoqué est « ${(clientContexte ?? '').trim()} ». Une question de suivi qui ne nomme PERSONNE (ex : « et son adresse ? », « et ses devis ? », « et le compte rendu ? », « et tout sur lui ? ») porte sur CE client : classe-la selon le SUJET (adresse/téléphone/email => clients ; devis/montant => devis ; compte rendu/rapport/observations => comptes_rendus ; tout/dossier complet => recap_client). Ne classe PAS ces suivis en "inconnu".\n`
    : ''
  const histo = blocHistoriquePourAiguillage(historique)
  return `Tu es l'aiguilleur d'un assistant pour un artisan maçon. Tu ne réponds PAS à la question : tu détermines de QUEL type de données elle relève.

QUESTION :
---
${question}
---
${ctx}${histo}

Réponds STRICTEMENT en JSON valide (aucun texte autour, pas de markdown), schéma EXACT :
{ "domaine": "devis | comptes_rendus | clients | recap_client | inconnu" }

DOMAINES :
- "devis" : ses devis, montants, prix, chiffre d'affaires, typologies de travaux chiffrées. Exemples : "mon prix moyen sur les reprises de maçonnerie", "mes 3 plus gros devis", "les devis de M. Dupont", "combien j'ai devisé pour tel client".
- "comptes_rendus" : ses comptes rendus de visite de chantier, ses observations terrain, les points de vigilance relevés, l'état constaté d'un ouvrage, le nombre de visites. SYNONYMES de "compte rendu" : "rapport" (de visite, de chantier), "CR", "bilan de visite", "compte-rendu". Exemples : "qu'avait-on noté chez M. Dupont", "quels chantiers avaient des fissures", "le compte rendu de tel chantier", "le rapport de tel chantier", "le CR de M. Dupont", "combien de visites j'ai faites".
- "clients" : l'IDENTITÉ et les COORDONNÉES de ses clients ou contacts (adresse, téléphone, email, fiche), ou la liste de ses clients. Exemples : "l'adresse de M. Dupont", "le téléphone de Mme Martin", "mes clients à Tours", "combien de clients j'ai".
- "recap_client" : une demande GLOBALE rassemblant TOUT ce qu'on sait sur UN client d'un coup (coordonnées + comptes rendus + devis). Exemples : "tout sur M. Dupont", "récap de M. Dupont", "fiche complète de Dupont", "le dossier de Dupont".
- "inconnu" : tout le reste (salutations, hors sujet, ou impossible à rattacher).

RÈGLES DE DÉPARTAGE (important) :
- Un MONTANT ou des DEVIS, MÊME avec un client nommé, => "devis".
- Une OBSERVATION / un constat terrain => "comptes_rendus".
- Toute demande de la forme "le compte rendu / le rapport / le CR / le bilan de X", "donne-moi le rapport de X" => "comptes_rendus", QUEL QUE SOIT le nom X. Le nom X est TOUJOURS un chantier ou un client de l'artisan, MÊME s'il ressemble à un nom célèbre ou historique. Ne classe JAMAIS ces questions en "inconnu".
- L'IDENTITÉ ou les COORDONNÉES (adresse, téléphone, email, fiche, liste de clients) => "clients".
- Une demande GLOBALE sur un client => "recap_client". MAIS une demande CIBLÉE sur UN seul aspect (l'adresse de X, les devis de X, le compte rendu de X) n'est PAS un récap.
- Si la question n'a rien à voir avec ses devis, ses visites ou ses clients, réponds "inconnu".`
}

function extraireJson(texte: string): { domaine?: string } {
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) throw new Error("Aucun JSON dans la réponse de l'aiguilleur.")
  return JSON.parse(m[0])
}

// Classe la question dans un domaine. REPLI sur "inconnu" en cas d'échec/timeout
// de l'appel ou de JSON invalide : en Phase 2, on ne veut pas router par défaut
// vers "devis" (non branché) sur une erreur — on renvoie un message d'orientation.
export async function aiguiller(
  question: string,
  clientContexte?: string | null,
  historique?: MessageHistorique[] | null,
): Promise<DomaineAssistant> {
  try {
    const rep = await anthropic.messages.create({
      model: MODELE_CLAUDE,
      max_tokens: 50,
      temperature: 0,
      messages: [{ role: 'user', content: promptAiguilleur(question, clientContexte, historique) }],
    })
    const texte = rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '') : ''
    const domaine = extraireJson(texte).domaine as DomaineAssistant | undefined
    if (domaine === 'inconnu') return 'inconnu'
    if (domaine && DOMAINES_CONNUS.has(domaine)) return domaine
    return 'inconnu'
  } catch (e) {
    console.error('[assistant/aiguilleur]', e)
    return 'inconnu'
  }
}
