-- =============================================================
-- 013 - Neutralisation de l'héritage « olivier » dans les tickets
-- =============================================================
-- CONTEXTE : le canal support « Demander à Julien » a été copié depuis ATG, où le
-- client s'appelait littéralement Olivier. Sur MTC37 le client est Hendrix → la
-- valeur sentinelle 'olivier' (colonne ticket_messages.auteur) et la colonne
-- tickets.lu_par_olivier étaient trompeuses (visibles telles quelles dans Supabase).
--
-- Cette migration remplace ce nom propre par le mot NEUTRE « client » (tenant-agnostique,
-- réutilisable pour n'importe quel client) :
--   1. ticket_messages.auteur : 'olivier'  -> 'client'
--   2. tickets.lu_par_olivier  (colonne)   -> lu_par_client
--
-- Idempotente : sûre à rejouer. Sur une base neuve (006 crée déjà lu_par_client),
-- le renommage est simplement ignoré (la colonne 'olivier' n'existe pas).
--
-- ⚠️ À exécuter en même temps que le déploiement du nouveau code (le code attend
--    désormais auteur='client' et la colonne lu_par_client). Trafic quasi nul sur
--    MTC37 → fenêtre négligeable.

-- ---- 1) Backfill de la valeur d'auteur ----
update public.ticket_messages
   set auteur = 'client'
 where auteur = 'olivier';

-- ---- 2) Renommage de la colonne (conditionnel = idempotent) ----
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'tickets'
       and column_name  = 'lu_par_olivier'
  ) then
    alter table public.tickets rename column lu_par_olivier to lu_par_client;
  end if;
end $$;
