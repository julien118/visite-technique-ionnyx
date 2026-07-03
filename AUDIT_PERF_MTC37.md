# AUDIT_PERF_MTC37 — 2026-07-03

Audit de performance du Système 30 Secondes (MTC37) — baseline chiffrée, goulots, leviers.
**Phase 1 : aucune modification de comportement. Aucun déploiement. Aucun secret affiché.**

---

## 1. Résumé exécutif

Les 3 douleurs d'Hendrix ont des causes racines identifiées, mesurées et corrigeables :

1. **Génération du rapport (~30 s ressentis sans aucun signal)** — L'appel au modèle IA est **bloquant de bout en bout : 28,2 s mesurés** sur une visite modeste, pendant lesquels le client ne reçoit **aucun signal réel** (la progression affichée est une animation fictive). En streaming, le premier signal arrive en **1,27 s**. S'y ajoutent **8 allers-retours base de données séquentiels** (~0,7-0,8 s de pur réseau, fonctions US ↔ base EU). Sur une grosse visite (3000-5000 tokens de sortie à 68 tok/s), la génération atteint 44-74 s → **le timeout de 60 s peut être touché** : c'est aussi un bug de fiabilité latent.
2. **Transcription vocale** — Le fichier audio part **deux fois** sur l'uplink 4G (une fois vers le Storage, une fois vers le serveur qui relaie à Groq), et il est **~4× trop lourd** (~880 Ko/min, bitrate par défaut du navigateur, alors que 232 Ko/min suffisent sans perte de qualité de transcription — vérifié). La transcription Groq elle-même est quasi instantanée (**~1 s pour 75 s d'audio**). Pendant tout ça, les boutons Photo/Vocal sont **bloqués** : Hendrix ne peut pas enchaîner.
3. **Upload photos** — Chaque photo bloque l'interface pendant tout son cycle (compression → upload → insertion DB, strictement séquentiel, ~5-8 s par photo en 4G médiocre), sans barre de progression. Et les vignettes rechargent ensuite les images **pleine résolution** (des Mo inutiles en 4G).

**Gains attendus** (détail §5) : premier signal de génération < 2 s au lieu de 30 s ; chaîne vocale ÷3 à ÷4 en temps réel + non bloquante ; photo → vignette < 1 s perçu + file d'attente non bloquante ; −0,5 à −0,8 s sur chaque action serveur si la région Vercel est alignée sur la base (décision à valider).

---

## 2. Contexte & méthodologie

### 2.1 Environnement mesuré
- **Code prod** : branche `chore/nextjs-16-20260703` (Next 16 + React 19), déployée le 03/07/2026 12h53 (confirmé par Julien). URL prod : `https://mtc37-systeme-30-secondes.ionnyx.cloud`.
- **Régions** : fonctions Vercel **iad1 (US-East)** — confirmé par `vercel inspect` (`λ … [iad1]`), aucune région dans `vercel.json`. Supabase ≈ **eu-west-1** (TTFB ~95-125 ms depuis la France, cohérent Irlande ; à confirmer 2 min dans le dashboard → Settings → Infrastructure). Anthropic/Groq : US.
- **Client type** : mobile, 4G chantier médiocre (profil retenu : 2 Mbps ↓ / 1 Mbps ↑, RTT 150 ms).

### 2.2 Méthodes et caveats
- Mesures réseau : `curl` avec timings (10-8 échantillons), depuis la France sur fibre.
- Mesure LLM : **reproduction exacte de l'appel prod** (même prompt système extrait de `lib/prompts.ts`, même modèle `claude-sonnet-4-6`, même `max_tokens`, flux réaliste 4 vocaux + 6 photos), en bloquant puis en streaming.
- Mesure transcription : dictée chantier réaliste de 75,6 s synthétisée (voix fr), encodée opus 128k stéréo (proxy du MediaRecorder actuel, bitrate non contraint) et 32k mono, envoyée à Groq `whisper-large-v3-turbo` avec les paramètres exacts de la prod.
- Lighthouse 13.x mobile, throttling simulé 4G médiocre (RTT 150 ms, 1,6 Mbps, CPU ×4), sur build de production local (`next build && next start`).
- **Caveats** : (a) ma machine ≈ profil « fonction EU », pas iad1 — les deux colonnes sont distinguées ; (b) dev local sur iCloud Drive : seuls les builds sont contaminés, pas les mesures réseau/API ; (c) poids photo réel et tokens réels par visite : **en attente** (lecture `usage_logs` prod + une URL photo réelle — autorisations demandées §7) ; (d) durées serveur réelles en prod : à confirmer en session coordonnée `vercel logs` (M3, planifiée).

---

## 3. Baseline chiffrée

### 3.1 Navigation SSR (prod réelle)

| Mesure | Valeur |
|---|---|
| TTFB `/login` prod — meilleur / médiane / p90 | **149 ms / ~340 ms / ~1,4 s** (10 hits) |
| TTFB `/login` prod — à froid (cold start) | **2,18 s** |
| TTFB `/login` local (même code, réseau nul) | **3 ms** → toute la latence est réseau + infra |
| Cold starts observés | 4 hits sur 10 > 800 ms : instances multiples, app peu trafiquée → cold starts fréquents |

Chaque navigation authentifiée ajoute : middleware `getUser()` = 1 RT Supabase Auth (**~90-100 ms depuis iad1**) + les requêtes de la page (déjà en `Promise.all`, bien).

### 3.2 Génération du rapport (douleur 1)

Décomposition du chemin critique `POST /api/generate-report` ([route.ts](app/api/generate-report/route.ts)) — **tout séquentiel** :

| Étape | Fichier:ligne | Coût mesuré/estimé (iad1↔eu-west-1) |
|---|---|---|
| 1. `auth.getUser()` | route.ts:23 | ~90-100 ms |
| 2. select `chantiers` | route.ts:29-33 | ~90-100 ms |
| 3. select `capture_items` | route.ts:40-44 | ~90-100 ms |
| 4. **Appel Anthropic bloquant** | lib/openai.ts:51-66 | **28,2 s mesurés** (voir ci-dessous) |
| 5. `await logAnthropicUsage` (insert `usage_logs`) | lib/openai.ts:101 | ~90-100 ms — dans le chemin critique |
| 6. insert `generation_logs` | route.ts:100-107 | ~90-100 ms — **round-trip payé même si la table n'existe pas** (aucune migration ne la crée ; supabase-js ne throw pas, le try/catch est inopérant) |
| 7. select `rapports` puis update **ou** insert | route.ts:113-135 | ~180-200 ms (2 RT — un `upsert` ferait 1 RT, index unique `rapports(chantier_id)` déjà en place) |
| 8. update `chantiers` statut | route.ts:138-141 | ~90-100 ms |
| **Total hors LLM** | | **~730-800 ms de pur réseau DB** |

**Mesure LLM (appel identique à la prod, visite modeste — 4 vocaux + 6 photos)** :

| Mode | Résultat |
|---|---|
| **Bloquant (comportement actuel)** | **28,2 s** — input 2350 tok, output 1910 tok, **67,6 tok/s** |
| **Streaming (levier R2)** | **premier token à 1,27 s**, total 29,8 s, 68,2 tok/s |
| Projection grosse visite (3000-5000 tok sortie) | **44-74 s → mur du `maxDuration = 60` (route.ts:9) atteignable** |

Pendant ces 28-60 s, le client voit une progression **fictive** (étapes animées toutes les 2,5 s, [rapport-client.tsx](app/chantiers/[id]/rapport/rapport-client.tsx) ~l.169-178) sans aucun lien avec l'avancement réel.

Prompt système : 4 686 caractères (~1 100 tokens) — léger, pas un levier majeur. Les photos ne partent pas au modèle (URLs texte uniquement, lib/prompts.ts:129).

### 3.3 Chaîne vocale (douleur 2)

**Poids réels mesurés** (dictée chantier 75,6 s) :

| Encodage | Poids | Ko/min | Qualité transcription Groq |
|---|---|---|---|
| opus 128k stéréo (≈ MediaRecorder actuel, bitrate non contraint — [AudioRecorder.tsx](components/AudioRecorder.tsx)) | 1 108 Ko | **~880 Ko/min** | référence |
| opus 32k mono (levier T2) | 293 Ko | **~232 Ko/min (÷3,8)** | **équivalente** (mêmes erreurs, aucune dégradation liée au bitrate) |
| Groq inference seule | — | — | **~1 s pour 75 s d'audio** (3,9 s total dont ~2,9 s d'upload fibre) |

**Chemin actuel** ([visite-client.tsx:183-250](app/chantiers/[id]/visite/visite-client.tsx#L183-L250)) — tout séquentiel, boutons bloqués (`processing` global) :
upload blob → Storage `audio` (retry 3×) → `createSignedUrl` → insert `capture_items` → **renvoi du MÊME blob** en FormData → `/api/transcribe` → relais Groq → update DB. **Le blob paie 2× l'uplink 4G.**

**Temps réseau estimés pour 60 s de dictée (880 Ko), hors Groq ~1-2 s :**

| Profil 4G | Uplink | Upload ×2 actuel | Après T1+T2 (1 seul envoi, 232 Ko) |
|---|---|---|---|
| Bonne (5 Mbps ↑) | 1,4 s ×2 | **~3-4 s** | ~0,5 s |
| Médiocre — Hendrix (1 Mbps ↑) | 7 s ×2 | **~15-17 s** | **~2-3 s (÷5-6)** |
| Mauvaise (0,25 Mbps ↑) | 28 s ×2 | **~60 s** | ~8-9 s |

Note fiabilité : `/api/transcribe` n'a **pas de `maxDuration`** explicite — sur réseau lent + long audio, risque de timeout par défaut (à vérifier en M3).

### 3.4 Chaîne photo (douleur 3)

Chemin actuel ([visite-client.tsx:252-292](app/chantiers/[id]/visite/visite-client.tsx#L252-L292)) — séquentiel, bloquant, sans progression :
`compressImage` (canvas 1920 px, JPEG q0.8 — [lib/utils.ts:37-51](lib/utils.ts#L37-L51)) → upload Storage → `getPublicUrl` (local, 0 RT) → insert DB → affichage. La vignette n'apparaît **qu'après le cycle complet**.

| Mesure | Valeur |
|---|---|
| Poids post-compression (estimation photo chantier 12 MP → 1920 px q0.8) | **300-800 Ko** (à confirmer sur photos réelles stockées — §7) |
| Temps bouton → vignette, 4G médiocre (600 Ko à 1 Mbps ↑ + RT insert) | **~6-8 s bloqués par photo** |
| Vignettes timeline/rapport ([CaptureItem.tsx](components/CaptureItem.tsx), [ReportView.tsx](components/ReportView.tsx)) | `<img>` **pleine résolution** réduite en CSS → une timeline de 10 photos ≈ **4-8 Mo** téléchargés en 4G |

EXIF : supprimé de facto par le re-encodage canvas. HEIC : décodé par le navigateur avant canvas (à vérifier sur iPhone réel en M3).

### 3.5 Frontend (Lighthouse mobile 4G médiocre, build prod local, `/login`)

| Métrique | Valeur | Budget cible |
|---|---|---|
| Score performance | 76 | > 90 |
| FCP / LCP | 3,3 s / **3,5 s** | LCP < 2,5 s |
| Speed Index | **8,8 s** | < 4 s |
| TBT / TTI | 90 ms / 3,6 s | OK / < 3 s |
| JS transféré | 282 Ko (11 fichiers) | correct |
| Fonts | 47 Ko — **Google Fonts via `@import` CSS** (globals.css:1) | `next/font` auto-hébergé |

Autres constats : **aucun service worker** (manifest seul — pas d'app-shell offline) ; `loading.tsx` uniquement sur `/chantiers` → **page blanche 1-2 s** sur détail/visite/rapport/devis ; `html2canvas` présent dans package.json mais **jamais importé** (vérifié).

### 3.6 Matrice régions (cartographie réseau)

| Trajet | RTT approx. | Payé... |
|---|---|---|
| Fonction **iad1** ↔ Supabase **eu-west-1** | **~80-100 ms** | ×8 séquentiels par génération, ×1+ par navigation, ×2+ par capture |
| Fonction iad1 ↔ Anthropic/Groq (US) | ~10-30 ms | ×1 par génération/transcription (avantage de iad1) |
| Fonction **dub1** ↔ Supabase eu-west-1 | ~1-5 ms | scénario cible R4 |
| Fonction dub1 ↔ Anthropic/Groq (US) | ~90-120 ms | ×1 seulement — la perte est marginale vs le gain DB |
| Mobile France ↔ edge Vercel (cdg1) | ~10-30 ms | inchangé |
| RTT mesurés depuis la France (fibre) | Supabase ~95-125 ms · Anthropic ~120-190 ms · Groq **~280 ms à 2,1 s (très variable)** | |

---

## 4. Goulots classés (preuves)

| # | Goulot | Preuve | Impact |
|---|---|---|---|
| G1 | **LLM bloquant sans signal réel** | 28,2 s mesurés, TTFT streaming 1,27 s ; fausse progression client | Douleur 1 — ressenti catastrophique + risque timeout 60 s |
| G2 | **Double envoi du blob audio sur l'uplink 4G** | visite-client.tsx:190 + :223-227 ; ×2 sur le poids | Douleur 2 — ~15-17 s au lieu de ~2-3 s possibles |
| G3 | **Audio 4× trop lourd** | 880 Ko/min mesuré vs 232 Ko/min iso-qualité | Douleur 2 — multiplicateur de G2 |
| G4 | **`processing` global bloque les captures** | visite-client.tsx:184, :253, boutons désactivés :501-517 | Douleurs 2+3 — Hendrix attend au lieu d'enchaîner |
| G5 | **8 RT DB séquentiels transatlantiques par génération** | §3.2 ; iad1 confirmé, base EU | Douleur 1 — ~0,75 s + G7 sur toutes les routes |
| G6 | **Photo : cycle séquentiel bloquant sans feedback** | visite-client.tsx:252-292 | Douleur 3 — 6-8 s bloqués par photo |
| G7 | **Fonctions US / base et client EU** | vercel.json sans `regions`, λ [iad1] | Transversal — chaque action paie l'Atlantique |
| G8 | **Vignettes pleine résolution** | CaptureItem/ReportView `<img>` direct | Timeline lourde (Mo) en 4G |
| G9 | LCP 3,5 s / Speed Index 8,8 s mobile ; fonts via `@import` ; pas de loading.tsx hors liste | §3.5 | Ressenti global app « lente » |

---

## 5. Leviers classés impact/effort (backlog Phase 2)

Branche : `perf/optim-mtc37-20260703` (depuis `chore/nextjs-16-20260703`). Un commit par levier. `tsc --noEmit && lint && build` après chaque lot. **Iso-comportement : le contenu des rapports, la logique devis/TVA et les sorties restent identiques.**

| Ordre | # | Levier | Gain attendu | Effort | Type | Verrou |
|---|---|---|---|---|---|---|
| 1 | R1 | Paralléliser les fetchs + `upsert` rapports + sortir `logAnthropicUsage` et `generation_logs` du chemin critique | **−400-700 ms réels**/génération | S | Réel | Non |
| 2 | T2 | `audioBitsPerSecond: 32000` + mono ([AudioRecorder.tsx](components/AudioRecorder.tsx)) — iso-qualité transcription **démontré** (§3.3) | Poids audio **÷3,8** → upload ÷3,8 | XS | Réel | Non (démontré) |
| 3 | F1 | `next/font` (Inter) au lieu de l'`@import` Google Fonts | LCP −300-800 ms | S | Réel | Non |
| 4 | F2 | `loading.tsx` sur [id]/visite/rapport/devis | Fin des pages blanches 1-2 s | XS | Ressenti | Non |
| 5 | F3 | Retirer `html2canvas` (jamais importé) | Hygiène | XS | — | Non |
| 6 | T1 | **Un seul envoi** du blob : `/api/transcribe` en chemin critique, upload Storage + insert **en parallèle** ; mêmes données finales stockées | **÷2 sur l'uplink vocal** (cumulé T2 : ~15-17 s → ~2-3 s) | M | Réel | Non |
| 7 | P2 | Photo : `Promise.all([upload, insert])` (URL publique connue avant upload) + rollback si échec | −0,5-1 s/photo | S | Réel | Non |
| 8 | T3+P1 | **File de captures** : état par item au lieu du `processing` global, vignette optimiste (`URL.createObjectURL`), concurrence 2, retry conservé, garde `beforeunload` | **Enchaîner les captures sans attendre** — le déblocage ressenti majeur | L | Ressenti | Non |
| 9 | R2 | **Streaming SSE** de la génération : progression réelle (tokens reçus), parse JSON final côté serveur inchangé ; permet de monter `maxDuration` | Premier signal **< 2 s** au lieu de 28-60 s + supprime le mur des 60 s | M | Ressenti + fiabilité | Non (contenu identique) |
| 10 | R3 | Prompt caching Anthropic (`cache_control` sur le system prompt) | TTFT −200-500 ms, coût input −~90 % sur la part cachée | XS | Réel léger | Non (signalé) |
| 11 | P3 | Vignettes légères : transform Supabase (`?width=480`) si dispo (test préliminaire encourageant, à confirmer avec une vraie URL), sinon `next/image` | Timeline **÷5-10 en Mo** ; **l'original reste stocké et servi au zoom** | S | Réel | Non |

### En attente de ta validation (verrous)

| # | Proposition | Gain | Ce que tu dois décider |
|---|---|---|---|
| R4 | `"regions": ["dub1"]` dans `vercel.json` (co-localisation base) | **−500-800 ms/génération, −200-400 ms/navigation, transcribe ~neutre** | Valider ce changement d'infra (commit prêt, appliqué seulement sur ton OK) — alternative : le faire toi-même dans le dashboard |
| F4 | Middleware `getUser()` → `getClaims()` (vérification JWT locale) | −90-150 ms/navigation | Nécessite d'activer les signing keys asymétriques dans le dashboard Supabase + valider le changement du chemin d'auth |
| P4 | Compression photo : **rien n'est touché** (1920/q0.8). Option : comparatif visuel 1920/q0.8 vs 1600/q0.75 à te fournir | −30-40 % poids photo éventuel | Tu tranches sur pièces (zoom Hendrix prioritaire) |
| F5 | Service worker app-shell : **reporté V2 recommandé** (risque de cache obsolète en prod sans canal de purge > bénéfice) | — | Valider le report |

**Leviers qui changent la forme sans changer le fond (signalés)** : R2 (le contrat HTTP client/serveur évolue, le rapport produit est identique), T1/T3/P1 (états intermédiaires visibles différents, données finales identiques), T2 (fichier audio stocké plus léger, transcription équivalente démontrée).

---

## 6. Budgets de performance cibles

| Étape | Baseline | Budget cible |
|---|---|---|
| Génération : premier signal réel | 28-60 s (aucun signal) | **< 3 s** |
| Génération : timeouts | mur 60 s atteignable | **zéro timeout** |
| Génération : temps serveur hors LLM | ~750 ms | **< 150 ms** (R1) / < 50 ms (avec R4) |
| Vocal 60 s → texte affiché (4G médiocre) | ~17-20 s bloqués | **≤ 5 s, non bloquant** |
| Photo : bouton → vignette visible | 6-8 s bloqués | **< 1 s (optimiste), file non bloquante** |
| Navigation authentifiée TTFB | ~340 ms-1,4 s + cold 2,2 s | **< 300 ms chaud / < 1,5 s froid** |
| LCP mobile 4G | 3,5 s | **< 2,5 s** |

---

## 7. Décisions et actions demandées (avant/pendant Phase 2)

1. **Valider ce rapport** et le lancement de la Phase 2 (ordre du §5).
2. **Verrous R4 / F4 / P4 / F5** : voir tableau ci-dessus — R4 (région) est le plus rentable.
3. **Autorisation lecture seule DB prod** (refusée par le garde-fou de permissions, à raison) : un `SELECT` sur `usage_logs` (tokens réels par génération → distribution réelle des durées LLM) et une URL de photo réelle (poids réels stockés + test transform). Dis-moi si tu autorises ces deux lectures ciblées.
4. **Session M3 (5 min)** : tu rejoues sur la prod 1 génération + 1 vocal + 2 photos pendant que je lis `vercel logs` → confirme les durées serveur réelles et le comportement HEIC iPhone.
5. **Dashboard (2 min)** : région exacte Supabase (Settings → Infrastructure) + plan (Free/Pro — conditionne le transform d'images P3).

## 8. Annexes — commandes reproductibles (re-test Phase 3)

```bash
# TTFB prod (10 hits)
for i in $(seq 1 10); do curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s\n" https://mtc37-systeme-30-secondes.ionnyx.cloud/login; done

# RTT API (remplacer <SUPA_URL> par NEXT_PUBLIC_SUPABASE_URL)
curl -s -o /dev/null -w "%{time_starttransfer}\n" <SUPA_URL>/auth/v1/health
curl -s -o /dev/null -w "%{time_starttransfer}\n" https://api.anthropic.com/v1/messages
curl -s -o /dev/null -w "%{time_starttransfer}\n" https://api.groq.com/openai/v1/models

# Mesure LLM identique prod (bloquant vs streaming) : scratchpad/mesure-anthropic.mjs
# Transcription Groq (75 s, 128k vs 32k) : scratchpad/dictee-chantier.txt + ffmpeg + curl -F

# Lighthouse mobile 4G médiocre sur build prod local
npm run build && npm run start &
npx lighthouse http://localhost:3000/login --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --throttling.rttMs=150 --throttling.throughputKbps=1638 \
  --throttling.cpuSlowdownMultiplier=4 --only-categories=performance
```

*Audit réalisé le 03/07/2026 — Phase 1 (lecture seule). Aucun comportement modifié, aucun déploiement, aucun secret affiché.*
