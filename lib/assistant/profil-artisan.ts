// =============================================================
// Profil de l'artisan servi par l'assistant (personnalisation)
// =============================================================
// L'assistant n'est pas générique : il s'adresse à UNE personne (Hendrix), pour
// UNE entreprise (MTC37), dans UN métier (maçonnerie). Ces trois éléments sont
// pilotés par env pour rester multi-tenant (réutilisable pour un autre client
// sans toucher au code) :
//   CONTACT_NOM       → prénom affiché      (défaut « Hendrix »)   [partagé avec notify.ts]
//   DEPLOYMENT_NAME   → nom de l'entreprise (défaut « MTC37 »)      [partagé avec notify.ts]
//   ASSISTANT_METIER  → secteur d'activité  (défaut « maçonnerie »)
//
// On réutilise nomContact()/nomDeploiement() de notify.ts pour ne pas dupliquer
// les défauts déjà en place côté Telegram.

import { nomContact, nomDeploiement } from '../notify'

export interface ProfilArtisan {
  nom: string
  entreprise: string
  metier: string
}

export function profilArtisan(): ProfilArtisan {
  return {
    nom: nomContact(),
    entreprise: nomDeploiement(),
    metier: process.env.ASSISTANT_METIER?.trim() || 'maçonnerie',
  }
}

// Bloc de contexte injecté en tête des prompts de rédaction : l'assistant SAIT à
// qui il parle et adapte son ton. Purement stylistique — ne fournit aucune donnée
// métier (les faits restent produits par le code, chaîne anti-hallucination).
export function blocContexteArtisan(): string {
  const p = profilArtisan()
  return `CONTEXTE : tu es l'assistant personnel de ${p.nom}, de l'entreprise ${p.entreprise} (secteur : ${p.metier}). Tu t'adresses directement à ${p.nom} : emploie son prénom naturellement (sans en abuser), sur un ton cordial et professionnel. Tu connais son métier — utilise le vocabulaire de la ${p.metier} quand c'est pertinent.`
}
