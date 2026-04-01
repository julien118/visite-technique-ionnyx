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
  rapport_genere: 'Rapport généré',
};

export const STATUT_COLORS: Record<ChantierStatut, string> = {
  planifie: 'bg-[#DBEAFE] text-[#1E40AF]',
  en_cours: 'bg-[#FFF7ED] text-[#C2410C]',
  termine: 'bg-[#FEF9C3] text-[#A16207]',
  rapport_genere: 'bg-[#DCFCE7] text-[#15803D]',
};

export const STATUT_BORDER_COLORS: Record<ChantierStatut, string> = {
  planifie: 'bg-[#1E40AF]',
  en_cours: 'bg-[#F97316]',
  termine: 'bg-[#A16207]',
  rapport_genere: 'bg-[#15803D]',
};
