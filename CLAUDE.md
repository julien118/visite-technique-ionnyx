# CLAUDE.md — Mémoire persistante du projet

> Ce fichier est lu au début de chaque session et mis à jour à la fin. Il constitue la mémoire de travail entre les sessions.

---

## 0. RÈGLE IMMUABLE — FAVICON (ne jamais casser)

**Le favicon de MTC37 est le logo IONNYX (fond blanc), identique à ATG. Jamais le triangle Vercel/Next.**

Contrat à respecter en permanence :
1. **Jamais d'icône dans `app/`** (`app/favicon.ico`, `app/icon.png`, `app/icon.*`, `app/apple-icon.*`). Next.js App Router auto-injecte et **écrase** tout ce qui est dans `app/` — c'est ce qui réintroduisait le triangle. La source unique = `public/`.
2. **Jeu complet dans `public/`** (tous = logo IONNYX) : `favicon.ico` (16+32 PNG embarqués), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`.
3. **Déclaré dans `app/layout.tsx` → `metadata.icons`** avec cache-busting `?v=N`. **Si un jour on change l'icône, incrémenter `?v=N` partout dans layout.tsx** (les navigateurs cachent les favicons très longtemps).
4. Le `manifest.json` pointe vers `/icon-192.png` + `/icon-512.png`.

Pour re-synchroniser depuis ATG si besoin : télécharger `/favicon-16.png`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` depuis `https://atg-systeme-30-secondes.ionnyx.fr` (le `<head>` de `/login` liste les chemins ; ATG n'a pas de `/favicon.ico` → le régénérer à partir du 16+32).

⚠️ **Cache Safari** : Safari indexe les favicons par URL de page et ignore souvent hard-refresh + `?v=`. Si l'icône semble bloquée en local : tester en fenêtre privée / Chrome (prouve que le serveur est bon), ou charger une URL de page différente (`localhost:3000/chantiers?x=1`), ou quitter Safari puis `rm -rf ~/Library/Safari/Favicon\ Cache`. Ce n'est **pas** un bug de l'app.

---

## 1. ÉTAT DU PROJET

**Nom :** Assistant de Visite Terrain IONNYX
**Version :** V2 (stable)
**Statut global :** MVP fonctionnel déployé sur Vercel + toutes les features core implémentées.

### Fonctionnalités terminées
- **Authentification** — Login email/mot de passe via Supabase Auth (pas de signup public, comptes créés manuellement)
- **Profil utilisateur** — Table `profiles` avec `company_name`, affichée dans le header (ex: "MTC37"). Trigger auto-création à l'inscription.
- **Liste des chantiers** — Dashboard avec :
  - Header dynamique (company_name ou email)
  - Onglets de filtre sticky : Tous | Planifiés | En cours | Finis | Rapports (avec compteurs)
  - Barre de recherche temps réel (nom/adresse/objet) avec bouton X, clavier se ferme au scroll
  - Tri intelligent : En cours et Planifiés en premier, puis Terminés et Rapports
  - Cartes avec bande colorée à gauche (border-l-4) selon statut
  - Badges colorés avec icônes (bleu/orange/jaune/vert)
  - Suppression par swipe gauche (mobile) ou bouton poubelle (desktop) + modale de confirmation
- **Création/édition de chantier** — Formulaire avec auto-save debounce 1s, autocomplétion adresse (API adresse.data.gouv.fr), bouton "Supprimer ce chantier" en bas
- **Capture terrain (feature core)** — Timeline verticale chronologique mixant vocaux et photos
- **Génération de rapport IA** — Claude (modèle via env `ANTHROPIC_MODEL`, défaut `claude-sonnet-4-6`) avec corrélation photos/observations
- **Affichage du rapport** — Observations groupées, édition inline, viewer photo plein écran
- **Export PDF (rapport)** — Généré **côté serveur** via jsPDF (`/api/export-pdf`). Personnalisé MTC37 (parité ATG) : logo `public/logo-mtc37.png` en en-tête sur la bande noire (chargé via l'origine de la requête — le middleware exclut les `.png`), « RAPPORT DE VISITE » + date alignés à droite, **sans footer** (retiré 03/07), nom de fichier `compte-rendu-<client>-<date>.pdf`.
- **Salutation personnalisée** — « Bonjour / Bon après-midi / Bonsoir {prénom} » discret en tête de la liste des chantiers, adapté à l'heure (calcul côté client → anti-hydratation). Prénom via env `CONTACT_NOM` (défaut « Hendrix »), multi-tenant.
- **Export pCloud** — Envoi du rapport PDF vers pCloud (dossier "2 ETUDES-DEVIS"), connexion par token (mot de passe jamais stocké). API /api/pcloud/*.
- **Suppression en cascade** — API DELETE /api/chantiers/[id] : supprime chantier + capture_items + rapport + fichiers Storage (audio + photos). RLS protège les données.
- **Résilience modèle IA** — Si Anthropic retire le modèle (404), bascule auto sur un repli (`MODEL_CHAIN` : sonnet-4-6 → sonnet-4-5 → opus-4-8) → jamais de coupure. Modèle surchargeable sans redéploiement via env `ANTHROPIC_MODEL`.
- **Observabilité & reporting (Telegram)** — Digests d'usage hebdo (dimanche) + mensuel (1er) : nb visites + tokens + coût **$/€** ; alerte immédiate si modèle retiré ; **alerte d'erreur en temps réel** (raison + comment résoudre). Piloté par env, multi-tenant. 📘 **Runbook complet : `SURVEILLANCE.md`.**
- **Error boundaries** — app/error.tsx + global-error.tsx : écran propre au lieu de l'écran blanc « Application error », + remontée des crashs client pour alerte.
- **Déploiement** — GitHub (julien118/visite-technique-ionnyx) + Vercel (visite-technique-mtc37.vercel.app)

### Fonctionnalités non implémentées (prévues V2+)
- Mode offline avec queue de sync
- Signup public
- Équipes multi-utilisateurs
- Génération de devis
- Notifications push
- Partage de rapport par lien

---

## 2. DÉCISIONS TECHNIQUES

| Décision | Choix | Pourquoi |
|----------|-------|----------|
| **Framework** | Next.js 14 (App Router) + TypeScript | Simple, rapide, serverless-ready, SSR pour l'auth |
| **CSS** | Tailwind CSS | Léger, mobile-first natif, pas de surcharge UI framework |
| **Backend/Auth/DB** | Supabase (PostgreSQL + Auth + Storage) | Tout-en-un, RLS pour isolation des données par user, storage intégré |
| **IA rapport** | Anthropic Claude — modèle via env `ANTHROPIC_MODEL` (défaut `claude-sonnet-4-6`) + chaîne de repli | Meilleur raisonnement ; le modèle codé en dur a déjà cassé la prod (retrait de Sonnet 4 le 15/06/2026) → repli auto + canari d'alerte |
| **Transcription audio** | Groq Whisper (whisper-large-v3-turbo) | Rapide (<10s), bon support du français |
| **PDF** | html2canvas + jspdf + jspdf-autotable | Génération côté client, pas de dépendance serveur |
| **Compression images** | Client-side canvas (max 1920px, JPEG 0.8) | Réduit la bande passante sur les chantiers avec 4G variable |
| **Architecture** | Server components pour auth/data, Client components pour interactif | Séparation claire, hydration minimale |
| **Storage buckets** | `audio` (privé), `photos` (public) | Photos publiques nécessaires pour l'analyse IA |
| **Profils utilisateurs** | Table `profiles` liée à `auth.users` avec trigger auto-création | Stocker company_name et futures préférences |
| **Suppression chantier** | API route DELETE + nettoyage Storage | Cascade DB via FK + suppression manuelle des fichiers Storage |
| **Déploiement** | Vercel (auto-deploy depuis GitHub) | Gratuit, intégration Next.js native |
| **Git config** | Email julien@ionnyx.fr | Nécessaire pour que Vercel Hobby accepte les commits |
| **Export cloud** | pCloud (token, dossier "2 ETUDES-DEVIS") | Remplace le Google Drive prévu ; mot de passe jamais stocké |
| **Observabilité** | Digests + alertes sur Telegram, piloté par env (DEPLOYMENT_NAME…), 1 cron dispatcher `/api/cron` | Surveillance complète, multi-tenant, réutilisable par client. Voir `SURVEILLANCE.md` |
| **Résilience modèle** | Chaîne de repli `MODEL_CHAIN` + canari `/api/model-health` | Anthropic retire ses snapshots ~1 an après leur sortie → jamais de coupure + alerte |

### Note technique
- **PDF du rapport = jsPDF côté SERVEUR** (`/api/export-pdf`), PAS html2canvas côté client (la ligne « PDF » du tableau §2 reflète un état antérieur). En-tête personnalisé MTC37 (logo + parité ATG), sans footer.
- **Footer retiré (03/07)** car il affichait « Rapport généré par MTC37 — Hendrix » : l'env **prod `DEPLOYMENT_NAME` = « MTC37 — Hendrix »** (utilisé aussi par les en-têtes Telegram via `nomDeploiement()`). À garder en tête si on réintroduit un footer un jour.
- Le fichier `lib/openai.ts` est mal nommé — contient en réalité le client Anthropic (clé `ANTHROPIC_API_KEY` = `sk-ant-…`, **PAS** une clé OpenAI). Héritage du switch GPT-4.1 → Claude, renommage pas encore fait. Confusion confirmée en Session 5.

---

## 3. CE QUI A MARCHÉ / CE QUI N'A PAS MARCHÉ

### Ce qui a marché
- **Architecture simple** — Pas d'over-engineering, composants directs, types stricts
- **Auto-save debounce** — UX fluide pour le formulaire chantier
- **Compression client-side** — Réduit drastiquement les temps d'upload sur le terrain
- **Timeline chronologique libre** — Les artisans capturent sans structure imposée, l'IA organise ensuite
- **RLS Supabase** — Isolation des données sans code custom côté serveur
- **Bande colorée + badges** — Repère visuel immédiat du statut de chaque chantier
- **Tri intelligent** — Les chantiers nécessitant une action apparaissent en premier

### Ce qui n'a pas marché / Leçons apprises
- **Switch OpenAI → Anthropic** — Le fichier `lib/openai.ts` est encore mal nommé, source de confusion. À renommer.
- **Pas de mode offline en V1** — Choix assumé pour simplifier le MVP, mais c'est le premier besoin terrain remonté
- **Déploiement Vercel** — Le build a échoué 2 fois :
  1. `Buffer` pas assignable à `BodyInit` dans export-pdf → fix : wrapper en `new Uint8Array()`
  2. Git email local (`@MacBook-Air`) non reconnu par GitHub → fix : configurer `julien@ionnyx.fr` + rebase + force push
- **Design itératif** — Le premier passage sur le design de la liste n'était pas assez abouti (badges gris, onglets coupés, cartes trop collées). Il a fallu 3 itérations pour arriver au bon résultat. Leçon : appliquer directement les classes Tailwind exactes demandées par l'utilisateur.

- **Modèle Anthropic codé en dur = bombe à retardement** — Le 2026-06-16, `claude-sonnet-4-20250514` (Sonnet 4) a été retiré par Anthropic → toutes les générations en 404 → 500 "Erreur de génération" (Hendrix bloqué). Fix : `claude-sonnet-4-6` + **chaîne de repli auto** + **canari quotidien** qui alerte sur Telegram. Leçon : toujours un fallback + une alerte sur les dépendances modèle.
- **Projet sur iCloud Drive (~/Desktop)** — Lenteurs/crashs en dev local (node_modules déchargés → ETIMEDOUT, build ~99s, dev server qui crashe au 1er lancement). À déplacer hors d'iCloud (ex. ~/Developer). N'affecte PAS la prod (Vercel).
- **Next.js 16 — Turbopack casse le build** — Depuis l'upgrade Next 16 (Session 7), le build Turbopack (défaut Next 16) échoue sur `/_not-found` (« Cannot find module for page », collecte page data). Fix figé : script `build` = **`next build --webpack`** (moteur de Next 14, éprouvé). ⚠️ Ne pas retirer `--webpack` sans revalider Turbopack. Vercel respecte le script → build local et distant identiques.
- **ESLint 9 flat config (Next 16)** — `eslint-config-next@16` exige ESLint 9. **Ne PAS utiliser FlatCompat** (plante « Converting circular structure to JSON » sur le plugin Next) : `eslint.config.mjs` importe les configs plates natives (`eslint-config-next/core-web-vitals` + `/typescript`). `public/` est ignoré (worker opus minifié). Règles `react-hooks/set-state-in-effect` + `purity` mises en `warn` (nouvelles règles React 19, code runtime intact).

### Bugs connus
- Aucun bug bloquant connu. Le bug critique de génération (modèle retiré, 16/06/2026) est corrigé et protégé par repli auto + alerte.

---

## 4. PROCHAINES ÉTAPES

1. **Renommer `lib/openai.ts`** → `lib/anthropic.ts` (cohérence — toujours pas fait, source de confusion confirmée)
2. **Déplacer le projet hors d'iCloud** (~/Developer) pour fluidifier le dev local
3. **Tester le flux complet** sur mobile réel (iPhone + Android)
4. **Mode offline** — Service worker + IndexedDB pour queue de sync
5. **Signup public** — Formulaire d'inscription avec validation email
6. **Optimisations UX terrain** — Retours utilisateurs à intégrer

---

*Dernière mise à jour : 2026-07-03 — **Session 8 (audit + optim performance)** : baseline chiffrée (`AUDIT_PERF_MTC37.md`) puis 12 leviers sur la branche **`perf/optim-mtc37-20260703`** (⚠️ NON déployée, à la main de Julien) : **streaming SSE de la génération** (28-60 s de silence → premier signal < 2 s, progression réelle, maxDuration 60→120), generate-report 8→3 RT DB (Promise.all + upsert + `after()`), **audio opus 32k mono** (880→232 Ko/min, transcription identique vérifiée) + **envoi unique** (`/api/transcribe` accepte `{path}`, relit le bucket côté serveur), **file de captures non bloquante** (items optimistes `temp-…`, vignette < 1 s, boutons jamais gelés, garde sur « Générer le rapport »), next/font, loading.tsx partout, vignettes **next/image** (photos stockées 0,6-2 Mo mesurées → ~30-80 Ko affichés ; transform Supabase = 403 sur le plan actuel), prompt caching, **`regions: ["dub1"]`** (iad1 confirmé avant ; Supabase ≈ eu-west-1 à confirmer au dashboard AVANT deploy). Mesures clés : gen bloquante 28,2 s à 68 tok/s (TTFT stream 1,27 s) ; Groq ~1 s pour 75 s d'audio ; Lighthouse /login 76→90, Speed Index 8,8→0,8 s. Résultats/actions/risques/checklist : `AUDIT_PERF_MTC37_RESULTATS.md`. ⚠️ Post-deploy : recharger les onglets ouverts (contrat SSE de generate-report changé) ; si le plan refuse maxDuration=120 → 60. Constat : la table `generation_logs` n'existe dans aucune migration (insert silencieusement ignoré). — **Session 7** (audit sécurité + upgrade Next 16) : audit sécurité complet (`AUDIT_SECURITE_MTC37.md`) puis remédiation déployée en prod. Correctifs : **IDOR service_role** sur `export-pdf`/`generate-report`/`pcloud-upload-rapport` → client session + RLS (les routes qui utilisaient `SUPABASE_SERVICE_ROLE_KEY` sans `getUser()` fuyaient/écrivaient sans contrôle car le middleware exclut `/api`) ; `transcribe` exige une session (abus coût Groq) ; `client-error` plafonné (anti-spam Telegram contournable) ; cron/relances/model-health/usage-digest en **fail-closed** (secrets déjà dans Vercel) ; **audio en chemin storage** au lieu d'un lien signé 1 an (jamais rejoué → M5). **Upgrade Next 14→16 + React 18→19 + ESLint 8→9** (corrige les CVE HIGH Next) — voir gotchas §3 (build `--webpack`, ESLint flat native). Reste documenté non fait : chiffrement token pCloud (M4), bucket photos privé (L1, casserait IA/PDF/Telegram), renommer `middleware.ts`→`proxy.ts`. — **Session 6** : personnalisation du rapport PDF (logo MTC37 en en-tête, parité ATG, **footer « Rapport généré par… » retiré**, nom de fichier `compte-rendu-<client>-<date>.pdf`), salutation contextuelle « Bonjour Hendrix » (heure, côté client), le tout déployé en prod. Deploy fait depuis un **git worktree isolé** pour ne pas embarquer le WIP non commité de Julien. Gotchas : l'outil Edit normalise les échappements Unicode → classe `[^\x00-\x7f]` pour dé-accentuer ; PDF rapport = jsPDF serveur (pas html2canvas). — **Session 5** : fix prod critique (modèle Sonnet 4 retiré → `claude-sonnet-4-6`) + résilience modèle (chaîne de repli + canari), export pCloud documenté, **digests usage/coût $/€ + alertes modèle & erreurs sur Telegram** (multi-tenant, voir `SURVEILLANCE.md`), rotation des clés Anthropic + Groq vérifiée (dev + prod). — Session 4 : déploiement GitHub/Vercel, header dynamique, suppression chantier, filtres/recherche, refonte design liste.*
