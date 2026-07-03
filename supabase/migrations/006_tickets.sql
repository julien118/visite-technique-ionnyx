-- =============================================================
-- 006 - Tickets support « Demander à Julien » (canal Telegram)
-- =============================================================
-- Le client (MTC37) envoie une demande (texte ou vocal) depuis le bouton « ? ».
-- Le serveur notifie Julien sur Telegram (bot dédié MTC37) et stocke le
-- message_id. Julien répond en « répondant » (reply) au message Telegram ; le
-- webhook /api/telegram-webhook retrouve le fil par ce message_id et écrit la
-- réponse. Le client la voit dans « Mes demandes » (pastille non-lu).
--
-- Schéma enrichi (fils de discussion multi-tours) dès la création : pas de
-- backfill (MTC37 n'a pas de tickets existants). Idempotent (IF NOT EXISTS).
--
-- ⚠️ MULTI-USER : contrairement à ATG (mono-user, policy permissive `using(true)`),
-- MTC37 est multi-utilisateur → RLS STRICTE par user_id pour isoler les tickets
-- entre comptes. Le webhook + le classifieur IA écrivent en service_role (qui
-- ignore la RLS). Les routes côté client lisent/écrivent via la session du user.

-- ---- Table tickets (en-tête de fil) ----
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,                       -- propriétaire (isolé par RLS)
  chantier_id uuid,                            -- contexte ; PAS de FK (survit à la suppression du chantier)
  message text not null,                       -- 1er message (aperçu / legacy)
  contexte jsonb not null default '{}'::jsonb, -- { path, chantierId, chantierLabel, viewport, userAgent }
  statut text not null default 'ouvert',       -- 'ouvert' | 'resolu'
  telegram_message_id bigint,                  -- matching des réponses Telegram (en-tête, legacy)
  lu_par_client boolean not null default true, -- pastille non-lu côté client (celui qui utilise l'app)
  categorie text,                              -- 'probleme'|'amelioration'|'question'|'autre' (IA)
  titre text,                                  -- résumé IA 3–6 mots
  reponse text,                                -- (legacy 1-réponse, conservé pour compat)
  repondu_le timestamptz,
  derniere_activite_le timestamptz
);
create index if not exists tickets_user_created_idx on public.tickets (user_id, created_at desc);
create index if not exists tickets_telegram_msg_idx on public.tickets (telegram_message_id);

-- ---- Table ticket_messages (un message par tour) ----
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  auteur text not null,                        -- 'client' (= celui qui utilise l'app) | 'julien' (= le support)
  texte text not null,
  telegram_message_id bigint,                  -- id du message bot posté (matching des replies) ; null côté julien
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
create index if not exists ticket_messages_tg_idx on public.ticket_messages (telegram_message_id);

-- ---- RLS multi-user (isolation par compte) ----
alter table public.tickets enable row level security;
drop policy if exists "tickets_select_own" on public.tickets;
create policy "tickets_select_own" on public.tickets
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own" on public.tickets
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "tickets_update_own" on public.tickets;
create policy "tickets_update_own" on public.tickets
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.ticket_messages enable row level security;
drop policy if exists "ticket_messages_select_own" on public.ticket_messages;
create policy "ticket_messages_select_own" on public.ticket_messages
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_messages.ticket_id and t.user_id = auth.uid()));
drop policy if exists "ticket_messages_insert_own" on public.ticket_messages;
create policy "ticket_messages_insert_own" on public.ticket_messages
  for insert to authenticated
  with check (exists (select 1 from public.tickets t where t.id = ticket_messages.ticket_id and t.user_id = auth.uid()));
