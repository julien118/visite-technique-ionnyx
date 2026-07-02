-- =============================================================
-- 007 - Photos dans les tickets « Demander à Julien »
-- =============================================================
-- Permet d'attacher UNE photo à un message de ticket, dans les DEUX sens :
--   • Hendrix (le client) joint une photo à sa demande / sa relance ;
--   • Julien répond avec une photo (envoyée depuis Telegram).
-- La photo est stockée dans le bucket public `photos` (déjà existant) ; on ne
-- garde ici que son URL publique. Additif et idempotent.

alter table public.ticket_messages add column if not exists image_url text;
