-- ============================================================
-- Migration 004 — Tokens Google Drive sur la table profiles
-- ============================================================

ALTER TABLE profiles
ADD COLUMN google_access_token TEXT,
ADD COLUMN google_refresh_token TEXT,
ADD COLUMN google_token_expiry TIMESTAMPTZ;
