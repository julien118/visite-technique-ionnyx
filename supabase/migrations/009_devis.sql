-- =============================================================
-- 009 - Devis (Phase 3 — moteur « prêt après la visite », Costructor)
-- =============================================================
-- À la fin du rapport, un bouton génère un devis structuré en croisant :
--   (1) ce qu'Hendrix a observé (dictée + rapport),
--   (2) ce qu'il a déjà chiffré (ses devis passés, lus en LECTURE SEULE chez lui),
--   (3) sa bibliothèque d'ouvrages Costructor.
-- Cette table stocke le devis proposé/édité côté MTC37 + le lien vers le brouillon
-- Costructor une fois poussé (push de TEST sur le compte de Julien).
--
-- 1 devis par chantier (upsert). MULTI-USER : RLS STRICTE par user_id (comme
-- tickets). Idempotent (IF NOT EXISTS).

create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'sections_proposees', 'metres_en_cours', 'pousse_costructor', 'echec')),
  sections_proposees jsonb not null default '[]'::jsonb, -- proposition IA (avant édition)
  sections_finales   jsonb not null default '[]'::jsonb, -- état édité par Hendrix (source du push)
  tva_taux numeric default 10,                           -- points de % (10 réno / 20 neuf)
  total_ht  numeric,
  total_ttc numeric,
  costructor_devis_id  text,                             -- id du brouillon Costructor (idempotence)
  costructor_devis_url text,
  pousse_le timestamptz,
  erreur_push text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 seul devis par chantier (upsert sur conflit)
create unique index if not exists idx_devis_chantier_id on public.devis(chantier_id);
create index if not exists idx_devis_user_id on public.devis(user_id);

-- updated_at auto (réutilise la fonction trigger existante, cf 001)
drop trigger if exists devis_updated_at on public.devis;
create trigger devis_updated_at
  before update on public.devis
  for each row execute function update_updated_at();

-- ---- RLS multi-user (isolation par compte) ----
alter table public.devis enable row level security;

drop policy if exists "devis_select_own" on public.devis;
create policy "devis_select_own" on public.devis
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "devis_insert_own" on public.devis;
create policy "devis_insert_own" on public.devis
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "devis_update_own" on public.devis;
create policy "devis_update_own" on public.devis
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "devis_delete_own" on public.devis;
create policy "devis_delete_own" on public.devis
  for delete to authenticated using (user_id = auth.uid());
