// Types principaux — Assistant de Visite Terrain IONNYX

export type ChantierStatut = 'planifie' | 'en_cours' | 'termine' | 'rapport_genere';
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
