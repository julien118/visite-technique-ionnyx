-- =============================================================
-- 012 - Assistant : journal d'interactions + boucle d'auto-apprentissage
-- =============================================================
-- L'assistant personnel (« Bonjour Hendrix ») journalise CHAQUE échange :
--   - la question posée,
--   - le domaine où elle a été rangée (comptes_rendus / devis / clients / …),
--   - la réponse renvoyée,
--   - un feedback 👍 (+1) / 👎 (-1) donné par l'artisan (0 = pas encore noté).
--
-- Cette mémoire sert la BOUCLE D'APPRENTISSAGE : à chaque nouvelle réponse, on
-- réinjecte dans le prompt ce que l'artisan a apprécié / pas apprécié / consulte
-- souvent → réponses de plus en plus pertinentes. Aucune écriture chez Hendrix.
--
-- MULTI-USER : RLS STRICTE par user_id (comme devis/tickets). Idempotent.

create table if not exists public.assistant_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  domaine text,                                   -- comptes_rendus | devis | clients | recap_client | inconnu
  reponse text,
  feedback smallint not null default 0            -- +1 = 👍, -1 = 👎, 0 = pas noté
    check (feedback in (-1, 0, 1)),
  created_at timestamptz not null default now()
);

-- Lecture chronologique par utilisateur (mémoire = les plus récentes).
create index if not exists idx_assistant_interactions_user
  on public.assistant_interactions(user_id, created_at desc);

-- ---- RLS multi-user (isolation par compte) ----
-- Les écritures passent par le service-role (garde-fou user_id explicite côté code),
-- mais on pose des policies complètes par sécurité (défense en profondeur).
alter table public.assistant_interactions enable row level security;

drop policy if exists "assistant_interactions_select_own" on public.assistant_interactions;
create policy "assistant_interactions_select_own" on public.assistant_interactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "assistant_interactions_insert_own" on public.assistant_interactions;
create policy "assistant_interactions_insert_own" on public.assistant_interactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "assistant_interactions_update_own" on public.assistant_interactions;
create policy "assistant_interactions_update_own" on public.assistant_interactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "assistant_interactions_delete_own" on public.assistant_interactions;
create policy "assistant_interactions_delete_own" on public.assistant_interactions
  for delete to authenticated using (user_id = auth.uid());
