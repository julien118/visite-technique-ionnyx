-- Table de suivi d'usage (tokens + coût) pour les digests hebdomadaires/mensuels.
-- Chaque appel Anthropic y insère une ligne (cf. lib/usage.ts -> logAnthropicUsage).
-- Le coût est calculé et stocké au moment de l'écriture → historiquement exact
-- même si les tarifs évoluent.

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service text not null,                       -- 'anthropic' | 'groq'
  model text,
  chantier_id uuid,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0
);

create index if not exists usage_logs_created_at_idx on public.usage_logs (created_at);
create index if not exists usage_logs_service_idx on public.usage_logs (service);

-- RLS activé sans policy utilisateur : seules les requêtes en service_role
-- (côté serveur) écrivent/lisent. Invisible côté client — c'est voulu.
alter table public.usage_logs enable row level security;
