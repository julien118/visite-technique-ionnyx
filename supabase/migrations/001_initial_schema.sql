-- ============================================================
-- Migration initiale — Assistant de Visite Terrain IONNYX
-- ============================================================

-- Extension pour générer des UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table : chantiers
-- ============================================================
CREATE TABLE chantiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_prenom TEXT NOT NULL,
  client_nom TEXT NOT NULL,
  client_adresse TEXT NOT NULL DEFAULT '',
  client_telephone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  date_visite TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  objet_travaux TEXT DEFAULT '',
  provenance TEXT DEFAULT '',
  type_chantier TEXT NOT NULL DEFAULT 'direct' CHECK (type_chantier IN ('direct', 'sous_traitance')),
  statut TEXT NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie', 'en_cours', 'termine', 'rapport_genere')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_chantiers_user_id ON chantiers(user_id);
CREATE INDEX idx_chantiers_date_visite ON chantiers(date_visite DESC);

-- ============================================================
-- Table : capture_items
-- ============================================================
CREATE TABLE capture_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vocal', 'photo')),
  position INTEGER NOT NULL,
  audio_url TEXT,
  transcription TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour récupérer le fil chronologique d'un chantier
CREATE INDEX idx_capture_items_chantier_id ON capture_items(chantier_id);
CREATE INDEX idx_capture_items_position ON capture_items(chantier_id, position ASC);

-- ============================================================
-- Table : rapports
-- ============================================================
CREATE TABLE rapports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  contenu_json JSONB,
  contenu_html TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul rapport par chantier (on écrase si régénéré)
CREATE UNIQUE INDEX idx_rapports_chantier_id ON rapports(chantier_id);

-- ============================================================
-- Fonction pour mettre à jour updated_at automatiquement
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chantiers_updated_at
  BEFORE UPDATE ON chantiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rapports_updated_at
  BEFORE UPDATE ON rapports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Activer RLS sur toutes les tables
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports ENABLE ROW LEVEL SECURITY;

-- Politiques pour chantiers : l'utilisateur ne voit que ses propres chantiers
CREATE POLICY "chantiers_select_own" ON chantiers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "chantiers_insert_own" ON chantiers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chantiers_update_own" ON chantiers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "chantiers_delete_own" ON chantiers
  FOR DELETE USING (auth.uid() = user_id);

-- Politiques pour capture_items : accès via le chantier de l'utilisateur
CREATE POLICY "capture_items_select_own" ON capture_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = capture_items.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "capture_items_insert_own" ON capture_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = capture_items.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "capture_items_update_own" ON capture_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = capture_items.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "capture_items_delete_own" ON capture_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = capture_items.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

-- Politiques pour rapports : accès via le chantier de l'utilisateur
CREATE POLICY "rapports_select_own" ON rapports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = rapports.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "rapports_insert_own" ON rapports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = rapports.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "rapports_update_own" ON rapports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = rapports.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

CREATE POLICY "rapports_delete_own" ON rapports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chantiers WHERE chantiers.id = rapports.chantier_id AND chantiers.user_id = auth.uid()
    )
  );

-- ============================================================
-- Storage Buckets
-- ============================================================
-- Note : les buckets doivent être créés via l'API Supabase ou le dashboard.
-- Les commandes ci-dessous sont les policies RLS pour le Storage.

-- Bucket "audio" : chaque utilisateur uploade dans son propre dossier (user_id/*)
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);

CREATE POLICY "audio_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "audio_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "audio_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Bucket "photos" : même logique
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true);

CREATE POLICY "photos_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "photos_read_public" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'photos'
  );

CREATE POLICY "photos_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]
  );
