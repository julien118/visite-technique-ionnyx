# 📡 Système de surveillance & reporting — Runbook de réplication

> Mis en place le 2026-06-16. Ce document décrit **exactement** quels messages sont
> envoyés, comment, quand, et **toute la configuration** pour le reproduire sur un
> autre projet/client. Tout est piloté par **variables d'environnement** : le même
> code se réutilise tel quel, on change seulement `DEPLOYMENT_NAME` (+ la base et le
> bot si besoin).

---

## 1. Ce que le système envoie (les 4 messages)

Tous les messages partent sur **Telegram** (et, en option, sur un webhook générique).

### 📊 A. Digest HEBDOMADAIRE
- **Quand** : chaque **dimanche**, ~**07:00 UTC** (≈ 9h heure française l'été / 8h l'hiver). Fenêtre Vercel Hobby de ±1h.
- **Déclenché par** : le cron quotidien `/api/cron` détecte `now.getUTCDay() === 0` → `buildDigest('week')`.
- **Période couverte** : les **7 derniers jours**.
- **Contenu** : nb de visites créées, nb de rapports générés, nb de photos/vocaux, total tokens (entrée/sortie), **coût en $ et €**.
- **Exemple** :
  ```
  📊 MTC37 — Hendrix
  Rapport hebdomadaire — Semaine du 9 juin au 16 juin
  🏗️ Activité
  • 2 visites créées
  • 1 rapport généré
  • 3 photos, 5 vocaux
  🧠 Consommation IA (Anthropic)
  • 2 248 tokens (entrée 1 762 / sortie 486)
  • Coût : $0.01  ≈  0,01 €
  ```

### 📊 B. Digest MENSUEL
- **Quand** : le **1er de chaque mois**, ~07:00 UTC.
- **Déclenché par** : `/api/cron` détecte `now.getUTCDate() === 1` → `buildDigest('month')`.
- **Période couverte** : le **mois civil précédent complet** (1er → dernier jour).
- **Contenu** : identique au hebdo, sur le mois.

### ⚠️ C. Alerte MODÈLE RETIRÉ (immédiate)
- **Quand** : vérifié **tous les jours** par `/api/cron` (et par `/api/model-health`). Envoyée **uniquement** si le modèle préféré est retiré (HTTP 404). Ce n'est PAS un message régulier.
- **Comment** : un probe minimal (`max_tokens: 1`) sur le modèle `ANTHROPIC_MODEL`. Si 404 → alerte.
- **Important** : la génération **bascule automatiquement** sur un modèle de repli (cf. `lib/openai.ts`, `MODEL_CHAIN`), donc l'utilisateur n'est **jamais coupé** — l'alerte sert juste à mettre à jour `ANTHROPIC_MODEL` tranquillement.
- **Exemple** :
  ```
  ⚠️ MTC37 — Hendrix — le modèle Anthropic « claude-sonnet-4-6 » semble RETIRÉ (404).
  La génération bascule automatiquement en repli (personne n'est bloqué),
  mais pense à mettre à jour la variable ANTHROPIC_MODEL.
  ```

### 🚨 D. Alerte ERREUR (immédiate)
- **Quand** : **dès qu'une erreur survient**, côté serveur (routes API) OU côté navigateur (crash d'interface). En temps réel.
- **Comment** : `reportError(context, error)` (dans `lib/monitoring.ts`) → message Telegram avec **OÙ**, **la RAISON**, et **COMMENT résoudre** (heuristique `diagnose()`).
- **But** : l'admin voit l'erreur **avant** l'utilisateur. L'utilisateur, lui, voit un écran propre (« Réessayer »).
- **Anti-spam** : une même erreur n'alerte qu'**une fois / 5 min** (throttle par signature).
- **Exemple** :
  ```
  🚨 MTC37 — Hendrix — erreur détectée
  📍 Où : Génération de rapport
  💬 Raison : Erreur Anthropic: 429
  🔧 Solution : Limite de débit Anthropic atteinte — temporaire, réessayer dans quelques minutes.
  🕐 16/06 18:50
  ```

---

## 2. Comment c'est envoyé (canaux)

- **Telegram** (recommandé) : via un bot (`@BotFather`). Variables `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. Messages en `parse_mode: HTML` (gras `<b>`).
- **Webhook générique** (optionnel) : `ALERT_WEBHOOK_URL` (n8n / Slack / Discord). Le payload contient `text` (Slack), `content` (Discord) et des métadonnées. Sert d'alternative ou de complément à Telegram.
- ⚠️ Le **token du bot ne transite jamais par le navigateur** : les crashs client sont envoyés à `/api/client-error`, qui alerte côté serveur.

---

## 3. Architecture (fichiers)

| Fichier | Rôle |
|---|---|
| `lib/notify.ts` | `sendTelegram()`, `sendWebhook()`, `notify()` — envoi sur tous les canaux configurés |
| `lib/usage.ts` | `logAnthropicUsage()` (journalise tokens+coût), `buildDigest('week'\|'month')`, table des tarifs, conversion USD→EUR (frankfurter.app + repli 0,92) |
| `lib/monitoring.ts` | `reportError(context, error)` + `diagnose()` (raison→solution) + anti-spam |
| `lib/openai.ts` | Client Anthropic (⚠️ **mal nommé**, ce n'est PAS OpenAI). Contient `MODEL_CHAIN` (repli auto) et journalise l'usage après chaque génération |
| `app/api/cron/route.ts` | **Dispatcher cron UNIQUE** (1 seul cron sur Hobby) : keep-alive + santé modèle quotidiens, digest hebdo le dimanche, mensuel le 1er |
| `app/api/usage-digest/route.ts` | Construit + envoie un digest. Test manuel : `?period=week\|month` |
| `app/api/model-health/route.ts` | Canari santé modèle (probe + alerte), utilisable seul |
| `app/api/client-error/route.ts` | Reçoit les crashs navigateur (depuis les error boundaries) → `reportError` |
| `app/error.tsx`, `app/global-error.tsx` | Error boundaries : écran propre pour l'utilisateur + remontée de l'erreur |
| `vercel.json` | Le cron : `{ "path": "/api/cron", "schedule": "0 7 * * *" }` |
| `supabase/migrations/20260616120000_usage_logs.sql` | La table `usage_logs` |

**Routes instrumentées par `reportError`** : `generate-report`, `transcribe`, `export-pdf`, suppression chantier (`chantiers/[id]`), `pcloud/upload-rapport`, `pcloud/connect`, `pcloud/disconnect`, + les étapes internes du cron.

---

## 4. Configuration — variables d'environnement

À poser dans **Vercel** (Settings → Environment Variables → Production) **et** dans `.env.local` pour le dev local.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | pour les alertes | Token du bot Telegram (`@BotFather`) |
| `TELEGRAM_CHAT_ID` | pour les alertes | ID du chat qui reçoit (via `@userinfobot` ; faire `/start` au bot une fois) |
| `DEPLOYMENT_NAME` | recommandé | Nom affiché en tête des messages (ex. « MTC37 — Hendrix »). **C'est la seule variable à changer par client.** |
| `CRON_SECRET` | recommandé | Protège `/api/cron` et les endpoints. Vercel l'envoie **automatiquement** au cron. Pour tester à la main : header `Authorization: Bearer <secret>`. |
| `ANTHROPIC_API_KEY` | oui (déjà présent) | Clé Anthropic `sk-ant-…` (génération de rapports) |
| `ANTHROPIC_MODEL` | non | Surcharge le modèle préféré sans redéployer (défaut `claude-sonnet-4-6`) |
| `ALERT_WEBHOOK_URL` | non | Webhook n8n/Slack/Discord en plus/à la place de Telegram |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | oui (déjà présent) | Accès base (digests + journalisation) |

> ⚠️ Changer une clé en **prod** = la modifier dans **Vercel** (pas seulement `.env.local`, qui n'agit que sur le dev local), puis **redéployer**.

---

## 5. La table `usage_logs` (SQL à lancer une fois par base)

Supabase → SQL Editor → coller → Run :

```sql
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service text not null,
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
alter table public.usage_logs enable row level security;
```

---

## 6. Tarifs utilisés pour le calcul du coût ($/M tokens)

Définis dans `lib/usage.ts` (`PRICING`). Le coût est calculé **au moment de l'écriture** (donc historiquement exact même si les tarifs changent).

| Modèle | Entrée | Sortie |
|---|---|---|
| claude-sonnet-4-6 / 4-5 | $3 | $15 |
| claude-opus-4-8 / 4-7 | $5 | $25 |
| claude-haiku-4-5 | $1 | $5 |

Ordres de grandeur mesurés : **petit rapport ≈ $0.01**, **gros rapport (20 photos) ≈ $0.11**.

---

## 7. Répliquer sur un NOUVEAU client (pas à pas)

1. **Partir du même code** (les fichiers de la section 3 sont génériques, rien à modifier dans le code).
2. **Base Supabase du client** → lancer le SQL de la section 5 (table `usage_logs`).
3. **Variables Vercel** du client (section 4) : poser au minimum `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DEPLOYMENT_NAME` (= le nom du client), `CRON_SECRET`. Le bot Telegram **peut être le même** (tous les clients écrivent dans le même chat, différenciés par `DEPLOYMENT_NAME`).
4. **Vérifier le cron** : Vercel → Settings → Cron Jobs → `/api/cron` doit apparaître (défini dans `vercel.json`). Sur Hobby : **1 cron max utile**, déclenchement quotidien, fenêtre ±1h, **en UTC**.
5. **Redéployer**.
6. **Tester** (section 8).

---

## 8. Comment tester (vérification)

- **Digest immédiat** : `GET /api/usage-digest?period=week` (ou `month`).
  Avec `CRON_SECRET` actif, ajouter le header `Authorization: Bearer <CRON_SECRET>`.
  → renvoie un aperçu JSON **et** envoie le message Telegram.
- **Cron de bout en bout** : Vercel → Cron Jobs → bouton **Run** sur `/api/cron`.
  → doit répondre `{"ok":true,...}` (et non `401`). Le digest ne part que si on est dimanche / le 1er.
- **Alerte erreur** : `POST /api/client-error` avec `{"message":"test","url":"..."}` → reçoit une alerte Telegram.
- **Santé modèle** : `GET /api/model-health` (avec le Bearer si `CRON_SECRET`) → `{healthy:true}` si le modèle est actif.

---

## 9. Pièges & notes importantes

- **Vercel Hobby = peu de crons** → on centralise tout dans **un seul** `/api/cron` quotidien. Ne pas ajouter de crons séparés.
- **Cron en UTC** + fenêtre **±1h** sur Hobby (l'heure n'est pas à la seconde près).
- **Coût « forward-only »** : il compte à partir de la création de la table + activation. Les visites sont comptées rétroactivement, pas le coût.
- **`lib/openai.ts` = client Anthropic** (nom hérité de l'époque GPT). La clé est `sk-ant-…`.
- **Résilience modèle** : si Anthropic retire le modèle, `MODEL_CHAIN` bascule auto (sonnet-4-6 → sonnet-4-5 → opus-4-8). L'alerte prévient pour mettre à jour `ANTHROPIC_MODEL`.
- **Le reporting ne casse jamais l'app** : `logAnthropicUsage` et `reportError` avalent leurs erreurs.

---

## 10. Historique de mise en place (2026-06-16)

| Commit | Contenu |
|---|---|
| `281497e` | Fix génération (modèle Sonnet 4 retiré → sonnet-4-6) + error boundary + gardes défensives |
| `3900828` | Résilience : chaîne de repli `MODEL_CHAIN` + canari `/api/model-health` |
| `527ab90` | Alerte Telegram directe pour le canari |
| `1e7b094` | Digests hebdo/mensuels (usage + coût $/€) |
| `81c2b52` | Surveillance d'erreurs (alerte raison + solution) |
| `66b1183` | Surveillance étendue aux routes secondaires |
