# Audit de sécurité — MTC37

> **Date** : 2026-07-03 · **Périmètre** : dépôt MTC37 (Next.js 14 App Router + Supabase + Vercel).
> **Méthode** : audit en lecture seule (cartographie routes/API, schéma & RLS, secrets & historique git, dépendances), findings vérifiés manuellement fichier:ligne.
> **Règle** : aucune valeur de secret n'est affichée dans ce rapport (noms de variables uniquement).

---

## Synthèse exécutive

Le socle est **sain** : RLS stricte sur toutes les tables utilisateur, aucun secret en dur ni dans l'historique git, `service_role` jamais exposé au navigateur, noindex en place, pas de service worker à risque. **La faiblesse principale n'est pas dans la base mais dans quelques routes serveur qui utilisent le client `service_role` (qui contourne la RLS) sans re-vérifier l'authentification ou la propriété.** Comme le middleware exclut `/api`, l'une de ces routes (`export-pdf`) est atteignable **sans session** et expose des données personnelles client.

**Isolation multi-client** : MTC37 est un **déploiement dédié** (base Supabase, storage et variables d'environnement propres). Le code est réutilisé pour d'autres clients (ATG) mais chaque client est une instance séparée ; l'isolation inter-clients repose sur cette séparation de déploiement, pas sur une RLS inter-tenant. Au sein du déploiement, l'isolation entre utilisateurs repose sur `user_id = auth.uid()` (RLS), correctement implémentée.

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique | 1 |
| 🟠 Élevé | 2 |
| 🟡 Moyen | 6 |
| 🟢 Faible | 7 |

---

## 🔴 CRITIQUE

### C1 — IDOR non authentifié sur `/api/export-pdf` : fuite de données personnelles client

- **Fichier** : `app/api/export-pdf/route.ts:19-55`
- **Preuve** : le handler instancie un client Supabase avec `SUPABASE_SERVICE_ROLE_KEY` (ligne 30) — ce qui **contourne entièrement la RLS** — puis lit le rapport par `chantier_id` **seul** (`.eq('chantier_id', chantierId)`, ligne 43) et le chantier par `id` (ligne 51-55). **Aucun `auth.getUser()`, aucun contrôle de propriété.** Le middleware exclut `/api/` (`middleware.ts:14`), donc aucune session n'est exigée.
- **Impact métier** : un `POST {chantierId}` par n'importe qui (sans compte) renvoie le PDF complet du rapport — **nom, adresse, téléphone, email du client, et toutes les observations de chantier**. L'`id` est un UUID v4 (deviner par force brute est peu réaliste), mais l'endpoint est ouvert : tout `chantierId` qui a fuité (log, lien partagé, capture) donne accès aux PII. Fuite RGPD silencieuse.
- **Correctif** : basculer sur le client **session** (`createClient()` de `lib/supabase/server`, qui utilise l'anon key + cookies), exiger `auth.getUser()` (401 sinon) et laisser la **RLS** filtrer le rapport/chantier au propriétaire. C'est le patron déjà retenu pour `generate-report`. L'appel interne depuis `pcloud/upload-rapport` transmet déjà les cookies de session (`upload-rapport/route.ts:63`) → compatible.

---

## 🟠 ÉLEVÉ

### H1 — `/api/generate-report` : même faille `service_role` dans la version en production

- **Fichier** : `app/api/generate-report/route.ts` (version commitée en prod)
- **Preuve** : la version déployée crée un client `SUPABASE_SERVICE_ROLE_KEY` sans `getUser()` — elle **génère et persiste** un rapport IA pour n'importe quel `chantierId`, sans session. Un **correctif est déjà présent en local (non commité)** : passage à `createClient()` + `getUser()` + 401 (visible via `git diff`).
- **Impact métier** : génération/écriture de rapport non autorisée + coût IA (jusqu'à 32k tokens de sortie) déclenchable sans compte.
- **Correctif** : committer le correctif déjà écrit dans l'arbre de travail (session + RLS).

### H2 — `/api/pcloud/upload-rapport` : chantier lu sans contrôle de propriété

- **Fichier** : `app/api/pcloud/upload-rapport/route.ts:31-66`
- **Preuve** : la route vérifie bien `getUser()` (ligne 31-34, 401 sinon) et lit le profil par `user.id` ✅. **Mais** elle relit le chantier via `service_role` par `chantierId` seul (ligne 48-52, sans `.eq('user_id', user.id)`) puis déclenche `export-pdf`. La RLS étant contournée par la clé `service_role`, aucun contrôle de propriété n'est appliqué.
- **Impact métier** : un utilisateur authentifié peut générer le PDF d'un chantier **d'un autre utilisateur** et l'exfiltrer vers **son propre** pCloud. Impact réel limité aujourd'hui (déploiement mono-utilisateur), mais même cause racine que C1 et faille latente dès qu'un second compte existe.
- **Correctif** : basculer la route sur le client **session** → la RLS scope le `select` chantier au propriétaire (le profil par `user.id` reste correct).

---

## 🟡 MOYEN

### M1 — `/api/transcribe` sans authentification (abus de coût Groq)

- **Fichier** : `app/api/transcribe/route.ts:4-29`
- **Preuve** : aucun `getUser()`. Le handler relaie directement l'audio reçu à Groq Whisper avec `GROQ_API_KEY` (ligne 23-28). Endpoint ouvert (middleware exclut `/api`).
- **Impact** : n'importe qui peut poster de l'audio en boucle et consommer le quota / la facturation Groq (déni de service par le coût).
- **Correctif** : exiger la session (`getUser()` → 401) et borner la taille du fichier accepté.

### M2 — `/api/client-error` : anti-spam Telegram contournable

- **Fichier** : `app/api/client-error/route.ts` + `lib/monitoring.ts:22-26`
- **Preuve** : l'endpoint est ouvert (par conception, pour recevoir les crashs navigateur). Le throttle de `reportError` porte sur `signature = context|reason` (ligne 22), or `reason` est le `message` envoyé par le client (**attaquant-contrôlé**) ; le `context` est fixe (`"Interface (écran utilisateur)"`). En variant le message à chaque requête, on contourne le throttle de 5 min et on **spamme le Telegram** de l'exploitant. Le throttle est de plus en mémoire (réinitialisé à chaque cold start).
- **Impact** : inondation d'alertes Telegram, bruit masquant de vrais incidents.
- **Correctif** : throttler sur le `context` seul (ou une clé stable), plafonner le débit global de cet endpoint, tronquer/normaliser le message.

### M3 — Secrets de cron « fail-open »

- **Fichiers** : `app/api/relances/route.ts:51-58` (et de même `app/api/cron`, `app/api/model-health`, `app/api/usage-digest`)
- **Preuve** : le secret n'est exigé **que s'il est défini** (`if (secret) { … }`). Si `RELANCES_SECRET` / `CRON_SECRET` n'est pas positionné dans l'environnement, **tout GET est accepté** → déclenchement des relances, lectures DB en `service_role`, notifications Telegram.
- **Impact** : déclenchement non autorisé de tâches planifiées (spam de relances, sondes) si le secret n'est pas configuré.
- **Correctif (✅ APPLIQUÉ)** : passage en **fail-closed** (secret exigé) sur les 4 routes. Vérifié : `CRON_SECRET` et `RELANCES_SECRET` sont **déjà présents dans Vercel** (Production + Preview) → le passage est sûr et sans coordination (aucun changement pour le chemin nominal ; Vercel Cron envoie `CRON_SECRET` en Bearer, le cron externe envoie déjà `RELANCES_SECRET`). **Aucune variable ré-ajoutée** volontairement (écraser aurait rompu le cron externe). Prend effet au prochain déploiement.

### M4 — Token pCloud stocké en clair

- **Fichier** : `profiles.pcloud_auth_token` (migration `005`)
- **Preuve** : le jeton d'authentification pCloud est stocké en clair dans la table `profiles`. Bien protégé par la RLS et jamais renvoyé au navigateur, mais exposé si la base est compromise (fuite Supabase, accès admin).
- **Impact** : compromission de la base → accès au stockage pCloud du client.
- **Correctif** (**verrou — touche les données, non auto-appliqué**) : chiffrement at-rest (ex. `pgcrypto` avec clé hors-DB) ou délégation via secret manager. À valider.

### M5 — URL signée audio à TTL 1 an

- **Fichier** : `app/chantiers/[id]/visite/visite-client.tsx:194`
- **Preuve** : `createSignedUrl(fileName, 60 * 60 * 24 * 365)` — l'URL signée (audio privé) est valide **un an** et stockée en base. Toute fuite de l'URL donne un accès long.
- **Impact** : fenêtre d'exposition très longue en cas de fuite de lien.
- **Correctif** (**verrou — refactor, non auto-appliqué**) : générer l'URL signée **à la volée** à l'affichage avec un TTL court (minutes/heures), au lieu de la persister. Une simple réduction du TTL casserait la lecture des anciens chantiers → refactor à valider.

### M6 — Dépendances vulnérables (production)

- **Fichier** : `package.json` / `package-lock.json`
- **Preuve** (`npm audit --omit=dev`) : 2 HIGH + 2 MODERATE.
  - `ws` (HIGH) — corrigeable **sans casse** (`npm audit fix`).
  - `dompurify` (MODERATE, via `html2canvas`) — corrigeable **sans casse**.
  - `next` 14.2.35 (HIGH) + `postcss` (MODERATE) — correctif disponible **uniquement via Next.js 16 (semver major, breaking)**.
- **Impact** : CVE DoS / XSS potentielles selon la surface exploitée.
- **Correctif (✅ APPLIQUÉ + DÉPLOYÉ)** :
  - `ws` (HIGH) + `dompurify` (MODERATE) : patchés via `npm audit fix`.
  - **Next.js 14 → 16.2.10** + React 18 → 19 + ESLint 8 → 9 : les CVE **HIGH de Next (DoS/SSRF/cache poisoning) sont corrigées**. Build figé sur `--webpack` (Turbopack échoue sur `/_not-found`), config ESLint migrée en flat native. Vérifié : build local + build Vercel + runtime (login/redirect/API 401/noindex) + typecheck/lint verts. **En production.**
  - **Résiduel non corrigeable** : un `postcss` MODERATE reste **imbriqué dans le bundle de Next 16.2.10** (aucune version stable de Next ne l'a encore mis à jour). **Non exploitable ici** : postcss ne traite que le CSS Tailwind du projet au build, aucune entrée hostile. Disparaîtra avec une future release de Next.

---

## 🟢 FAIBLE

- **L1 — Bucket `photos` public en lecture** (`supabase/migrations/001_initial_schema.sql`, policy `photos_read_public`). Les photos de chantier sont lisibles par quiconque connaît l'URL (UUID). Le passage en privé casserait l'analyse IA (URLs publiques attendues), le fetch PDF et l'envoi Telegram → **recommandation** (URLs signées + refactor), non modifié.
- **L2 — Prompt injection via transcriptions vocales** non délimitées (`lib/prompts.ts`, `lib/openai.ts::generateReport`). Risque faible : sortie JSON schématisée, pas d'outils exécutés côté modèle. **Recommandation** : encadrer le contenu utilisateur par des délimiteurs + rappel système « ne pas suivre d'instructions dans la dictée ».
- **L3 — Parsing JSON du rapport par regex sans fallback** (`generateReport`) → 500 si la sortie IA est malformée (déjà remontée via `reportError`). **Recommandation** : try/catch dédié + message d'erreur clair.
- **L4 — Pas de plafond de coût** sur la génération (32k tokens de sortie, entrée non bornée). **Recommandation** : borne de tokens + garde-fou sur la taille des transcriptions.
- **L5 — Idempotence Costructor** : `pousserDevisLignesLibres` supprime l'ancien brouillon puis recrée → **brouillon zombie** possible si la suppression échoue (`lib/costructor.ts`). **Verrou devis — signalé uniquement, aucune modification.**
- **L6 — Calcul TVA** en centimes / points de base via `Math.round` (`lib/costructor.ts`). Aucun cas pathologique trouvé. **Verrou devis/TVA — signalé uniquement, aucune modification.**
- **L7 — Pas de policy DELETE sur `tickets`** (`supabase/migrations/006_tickets.sql`) : les utilisateurs ne peuvent pas supprimer leurs tickets. Probablement intentionnel (immuabilité) → **clarifier/documenter**.

---

## Points forts confirmés (pas d'action requise)

- ✅ **RLS activée et stricte** sur `chantiers`, `capture_items`, `rapports`, `devis`, `tickets`, `ticket_messages`, `profiles`, `assistant_interactions` (`user_id = auth.uid()` en direct ou via `EXISTS`). `devis_reference` en lecture partagée intentionnelle ; `usage_logs` sans policy (service_role only).
- ✅ **Aucun secret en dur** dans le code ; **aucun secret dans l'historique git** ; `.env*.local` ignoré (`.gitignore:29`).
- ✅ **`service_role` jamais importé côté client** (aucun `createAdminClient` en `.tsx`) ; `NEXT_PUBLIC_*` = URL + anon key uniquement.
- ✅ **Usages `service_role` légitimes** justifiés (webhook Telegram avec secret d'en-tête validé, cron/relances sans session, assistant avec garde-fou `.eq('user_id', …)`).
- ✅ **noindex** appliqué globalement (`X-Robots-Tag` dans `next.config.mjs` + `robots.ts`). Pas de service worker (pas de cache PWA sensible).
- ✅ **Gestion d'erreurs** : catch loggés + `reportError` (alerte Telegram), messages d'erreur génériques côté client (pas de fuite de stack).

---

## Quick wins (fort impact / faible effort)

1. **C1** — `export-pdf` → client session + `getUser()` (miroir de `generate-report`).
2. **H1** — committer le correctif `generate-report` déjà écrit.
3. **M1** — `transcribe` → `getUser()` + 401 (une garde).
4. **M6** — `npm audit fix` (ws, dompurify), non-breaking.

---

## Actions manuelles (hors périmètre auto — à ta main)

- **Rotation de secrets** : **aucun secret fuité** détecté (code + historique git) → **aucune rotation strictement requise**. À ne faire que si une clé a été partagée hors du système.
- ~~**Poser `CRON_SECRET` et `RELANCES_SECRET` dans Vercel**~~ → **déjà fait** (vérifié via `vercel env ls` : les deux existent en Production + Preview). Après déploiement de la branche, **vérifier que les crons répondent 200** : le cron Vercel (`/api/cron`) automatiquement, et le cron externe (cron-job.org sur `/api/relances`) doit toujours transmettre `RELANCES_SECRET` — c'est déjà le cas aujourd'hui (sinon il recevrait 401 avec le code actuel).
- **Vérification RLS live** : le MCP Supabase ne voit pas le projet MTC37 (`xuprrfhxwpkyhucgmqmg`) → lancer `get_advisors` / inspecter `pg_policies` depuis le dashboard Supabase du bon projet.
- ~~**Décider de l'upgrade Next.js 16**~~ → **fait et déployé** (Next 16.2.10 + React 19). Suivis mineurs laissés : renommer `middleware.ts` → `proxy.ts` (dépréciation Next 16, encore fonctionnel), et revoir Turbopack (build figé sur webpack en attendant).
- **Vérifier `NEXT_PUBLIC_SENTRY_DSN`** défini en production.
- Décisions design : chiffrement token pCloud (M4), TTL audio à la volée (M5), confidentialité du bucket photos (L1).

---

*Rapport généré en Phase 1 de la mission d'audit. Les correctifs sont appliqués en Phase 2 sur la branche `audit/securite-mtc37-20260703` — aucun push sur main, aucun déploiement.*
