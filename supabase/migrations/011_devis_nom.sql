-- =============================================================
-- 011 - Nom de devis modifiable
-- =============================================================
-- Hendrix peut renommer son devis à la main sur le récapitulatif (au lieu du nom
-- auto « Devis maçonnerie — Client »). Ce nom est utilisé comme titre du brouillon
-- Costructor au push. Idempotent.

alter table public.devis add column if not exists nom text;
