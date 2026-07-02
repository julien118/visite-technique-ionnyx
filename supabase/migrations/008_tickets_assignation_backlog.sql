-- =============================================================
-- 008 - Assignation, backlog & relances pour les tickets support
-- =============================================================
-- Trois besoins ajoutés au système « Demander à Julien » :
--
--  1) ASSIGNATION (« Je prends ») — quand Julien OU Lotfi voient la même demande
--     dans le groupe Telegram, l'un d'eux tape le bouton « 🙋 Je prends ». On note
--     qui a pris le fil → l'autre sait qu'il n'a rien à faire (fini le double-traitement).
--
--  2) BACKLOG — toute demande classée « probleme » ou « amelioration » par l'IA est
--     automatiquement versée dans un backlog (statut + priorité) pour qu'AUCUNE idée
--     terrain ou bug ne soit perdu. Consultable dans Supabase ; résumé dans le digest.
--
--  3) RELANCES — pour qu'aucune demande ne passe à la trappe, un cron externe relance
--     toutes les 2h (8h→20h) les fils ouverts non pris et sans réponse. On mémorise
--     la dernière relance pour ne pas spammer.
--
-- Additif et idempotent (IF NOT EXISTS). Colonnes écrites en service_role (webhook +
-- cron de relance) ; les policies RLS existantes (006) restent inchangées.

-- ---- 1) Assignation ----
alter table public.tickets add column if not exists pris_par text;        -- prénom de celui qui traite (ex. « Julien », « Lotfi ») ; null = personne
alter table public.tickets add column if not exists pris_le timestamptz;  -- quand le fil a été pris

-- ---- 2) Backlog (uniquement renseigné pour probleme/amelioration) ----
-- backlog_statut : 'nouveau' | 'en_cours' | 'fait' | 'abandonne' ; null = hors backlog
alter table public.tickets add column if not exists backlog_statut text;
-- priorite : 'basse' | 'normale' | 'haute' ; null = non priorisé (défaut 'normale' à la création backlog)
alter table public.tickets add column if not exists priorite text;

-- ---- 3) Relances ----
alter table public.tickets add column if not exists relances_envoyees int not null default 0;
alter table public.tickets add column if not exists derniere_relance_le timestamptz;

-- Index pour le cron de relance : il cherche les fils non résolus, par activité.
create index if not exists tickets_statut_activite_idx
  on public.tickets (statut, derniere_activite_le);

-- Index pour la vue backlog (filtre sur backlog_statut non null).
create index if not exists tickets_backlog_idx
  on public.tickets (backlog_statut) where backlog_statut is not null;

-- ---- Vue pratique : le backlog produit (à consulter dans Supabase) ----
-- Regroupe bugs + améliorations non terminés, du plus prioritaire au plus ancien.
create or replace view public.backlog as
  select
    id, created_at, categorie, titre, message, priorite, backlog_statut,
    pris_par, statut as statut_support, chantier_id
  from public.tickets
  where backlog_statut is not null and backlog_statut <> 'fait' and backlog_statut <> 'abandonne'
  order by
    case priorite when 'haute' then 0 when 'normale' then 1 else 2 end,
    created_at desc;
