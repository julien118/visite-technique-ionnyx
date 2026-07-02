-- =============================================================
-- 010 - Index « déjà chiffré » persistant (devis passés d'Hendrix)
-- =============================================================
-- Problème : reconstruire l'index des ~120 devis passés EN DIRECT à chaque 1re
-- préparation prenait > 2 min (1 requête Costructor par devis + rate-limit).
-- Solution : on persiste l'index ici. La préparation le LIT d'un coup (instantané) ;
-- la (re)construction se fait hors du chemin critique (1re fois puis rafraîchie).
--
-- Données de RÉFÉRENCE partagées (issues du compte Costructor d'Hendrix, non liées
-- à un utilisateur) : lecture pour tout utilisateur authentifié, ÉCRITURE réservée
-- au service_role (le job d'indexation via createAdminClient). Idempotent.

create table if not exists public.devis_reference (
  costructor_id text primary key,          -- quote_… (id du devis passé)
  nom text,                                -- project.name / name
  statut text,
  total_ht numeric,                        -- euros
  mots_cles jsonb not null default '[]'::jsonb,   -- jetons de typologie
  ouvrages  jsonb not null default '[]'::jsonb,   -- [{product_id, titre, unite, prix_vente, tva_taux, description}]
  updated_at timestamptz not null default now()
);

alter table public.devis_reference enable row level security;

-- Lecture pour tout utilisateur authentifié (référence partagée).
drop policy if exists "devis_reference_select" on public.devis_reference;
create policy "devis_reference_select" on public.devis_reference
  for select to authenticated using (true);

-- Pas de policy insert/update/delete pour `authenticated` : seule la clé
-- service_role (job d'indexation) écrit → aucune écriture possible côté navigateur.
