-- ============================================================
-- Migration 005 — Tokens pCloud sur la table profiles
-- ============================================================
-- Remplace l'intégration Google Drive par pCloud.
-- Le token d'authentification pCloud est obtenu après login
-- utilisateur dans l'app (jamais stocké en clair côté serveur).

ALTER TABLE profiles
DROP COLUMN IF EXISTS google_access_token,
DROP COLUMN IF EXISTS google_refresh_token,
DROP COLUMN IF EXISTS google_token_expiry;

ALTER TABLE profiles
ADD COLUMN pcloud_auth_token TEXT,
ADD COLUMN pcloud_hostname TEXT DEFAULT 'eapi.pcloud.com',
ADD COLUMN pcloud_email TEXT;
