-- ============================================================
-- Migration 003 — Liaison photo/vocal dans capture_items
-- ============================================================
-- Permet de rattacher une observation vocale à une photo.
-- ON DELETE SET NULL : si la photo est supprimée, le vocal redevient indépendant.

ALTER TABLE capture_items
ADD COLUMN linked_photo_id UUID REFERENCES capture_items(id) ON DELETE SET NULL;

CREATE INDEX idx_capture_items_linked_photo
ON capture_items(linked_photo_id)
WHERE linked_photo_id IS NOT NULL;
