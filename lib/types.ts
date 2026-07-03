// Types principaux — Assistant de Visite Terrain IONNYX

export type ChantierStatut = 'planifie' | 'en_cours' | 'termine' | 'rapport_genere';
// Statut d'un devis lié (Phase 3 / Costructor). Déclaré dès maintenant pour que
// le statut affiché dérivé (lib/statut-affaire) compile ; aucune table devis tant
// que la Phase 3 n'est pas faite (devisStatut vaut donc toujours null d'ici là).
export type DevisStatut = 'brouillon' | 'sections_proposees' | 'metres_en_cours' | 'pousse_costructor' | 'echec';
export type TypeChantier = 'direct' | 'sous_traitance';
export type CaptureType = 'vocal' | 'photo';

export interface Chantier {
  id: string;
  user_id: string;
  client_prenom: string;
  client_nom: string;
  client_adresse: string;
  client_telephone: string;
  client_email: string;
  date_visite: string;
  objet_travaux: string;
  provenance: string;
  type_chantier: TypeChantier;
  statut: ChantierStatut;
  created_at: string;
  updated_at: string;
}

export interface CaptureItem {
  id: string;
  chantier_id: string;
  type: CaptureType;
  position: number;
  audio_url: string | null;
  transcription: string | null;
  photo_url: string | null;
  linked_photo_id: string | null;
  created_at: string;
}

export interface RapportObservationPhoto {
  url: string;
  legende: string;
}

export interface RapportObservation {
  titre: string;
  description: string;
  points_vigilance: string[];
  photos: RapportObservationPhoto[];
}

export interface RapportContenu {
  client: {
    prenom: string;
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    date_visite: string;
    provenance: string;
    type_chantier: string;
  };
  observations: RapportObservation[];
  acces_chantier: string;
  duree_estimee: string;
  notes: string;
}

export interface Rapport {
  id: string;
  chantier_id: string;
  contenu_json: RapportContenu | null;
  contenu_html: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================
// DEVIS (Phase 3 — moteur « prêt après la visite », Costructor)
// =============================================================

// Compte Costructor ciblé pour les ÉCRITURES (push). Défaut = HENDRIX (MTC37, prod :
// lecture + création des brouillons de devis). 'julien' = bac à sable de test (opt-in).
export type CompteCostructor = 'julien' | 'hendrix';

// Un ouvrage de la bibliothèque Costructor d'Hendrix, nettoyé pour le moteur.
export interface ArticleRemplacable {
  costructor_article_id: string;   // prod_…
  libelle: string;                 // libellé nettoyé
  unite: string;                   // symbol : 'u' | 'm²' | 'ml' | 'm³' | 'ens' | 'fft'…
  prix_vente: number;              // EUROS (sellPrice centimes / 100)
  description_source?: string;     // description existante de l'ouvrage (base de rédaction)
  uses?: number;                   // popularité (pré-sélection)
}

// Un ouvrage retenu dans une section du devis proposé.
export interface ArticleDevis {
  costructor_article_id: string;   // prod_… d'origine (vide '' si ligne purement libre)
  libelle: string;
  unite: string;
  prix_vente: number;              // euros
  quantite: number | null;         // null tant que le métré n'est pas saisi
  description_technique: string;   // adaptée au chantier (base = description_source)
  origine?: 'catalogue' | 'devis_passe'; // traçabilité de la source de l'ouvrage
}

export interface SectionDevis {
  nom: string;                     // phase de travaux (ex. « FONDATIONS »)
  articles: ArticleDevis[];
}

// Sortie brute de Claude (avant whitelist serveur).
export interface PropositionDevisIA {
  sections: SectionDevis[];
}

// Un ouvrage tel que retrouvé dans un devis passé d'Hendrix (« déjà chiffré »).
export interface OuvrageReference {
  product_id: string | null;       // lien catalogue (peut être null)
  titre: string;                   // titre nettoyé de la ligne
  unite: string;
  prix_vente: number;              // euros
  tva_taux: number | null;         // points de % (ex. 10, 20)
  description: string;             // description de la ligne (HTML strippé)
}

// Un devis passé indexé pour le matching de typologie.
export interface DevisReference {
  id: string;                      // quote_…
  nom: string;                     // project.name / name
  statut: string;
  total_ht: number | null;         // euros
  mots_cles: string[];             // jetons de typologie (nom + titres d'ouvrages)
  ouvrages: OuvrageReference[];
}

// Devis persisté (table public.devis).
export interface Devis {
  id: string;
  user_id: string;
  chantier_id: string;
  statut: DevisStatut;
  nom: string | null;               // nom du devis (modifiable ; défaut auto depuis le client)
  sections_proposees: SectionDevis[];
  sections_finales: SectionDevis[];
  tva_taux: number | null;         // points de % (défaut 10)
  total_ht: number | null;
  total_ttc: number | null;
  costructor_devis_id: string | null;
  costructor_devis_url: string | null;
  pousse_le: string | null;
  erreur_push: string | null;
  created_at: string;
  updated_at: string;
}

// Contexte auto-capturé côté client lors de l'envoi d'un ticket (page, chantier,
// appareil…). JSONB côté base — sert au formatage de la notification Telegram.
export interface TicketContexte {
  path?: string;
  chantierId?: string;
  chantierLabel?: string;
  viewport?: string;
  userAgent?: string;
}

// 'ouvert' = fil actif | 'resolu' = clos (archivé, toujours consultable).
export type TicketStatut = 'ouvert' | 'resolu';

// Un message dans un fil de discussion (table ticket_messages).
export interface TicketMessage {
  id: string;
  auteur: 'client' | 'julien'; // 'client' = celui qui utilise l'app (Hendrix sur MTC37) | 'julien' = le support
  texte: string;
  image_url?: string | null;    // photo jointe (bucket public `photos`), optionnelle
  created_at: string;
}

// Carte compacte renvoyée par GET /api/tickets (liste « Mes demandes »).
export interface TicketResume {
  id: string;
  categorie: string | null;
  statut: TicketStatut;
  titre: string | null;
  apercu: string; // titre IA si présent, sinon début du 1er message
  lu_par_client: boolean;
  derniere_activite_le: string | null;
  nb_messages: number;
  dernier_auteur: 'client' | 'julien' | null;
}

// Détail d'un fil renvoyé par GET /api/tickets/[id].
export interface TicketDetail {
  id: string;
  categorie: string | null;
  statut: TicketStatut;
  titre: string | null;
  created_at: string;
  messages: TicketMessage[];
}

// Labels pour l'affichage des statuts en français
export const STATUT_LABELS: Record<ChantierStatut, string> = {
  planifie: 'Planifié',
  en_cours: 'En cours',
  termine: 'Terminé',
  rapport_genere: 'Rapport',
};

export const STATUT_COLORS: Record<ChantierStatut, string> = {
  planifie: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  en_cours: 'bg-amber-50 text-amber-700 border border-amber-200',
  termine: 'bg-gray-100 text-gray-600 border border-gray-200',
  rapport_genere: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

export const STATUT_BORDER_COLORS: Record<ChantierStatut, string> = {
  planifie: 'border-emerald-400',
  en_cours: 'border-amber-400',
  termine: 'border-gray-300',
  rapport_genere: 'border-emerald-400',
};
