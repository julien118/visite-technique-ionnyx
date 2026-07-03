# AUDIT_PERF_MTC37 — RÉSULTATS (Phase 2/3) — 2026-07-03

Suite de [AUDIT_PERF_MTC37.md](AUDIT_PERF_MTC37.md) (baseline). **12 commits sur la branche `perf/optim-mtc37-20260703`. Rien n'est poussé sur main, rien n'est déployé.** Typecheck + lint + build verts après chaque commit.

---

## 1. AVANT / APRÈS par douleur

Les gains « après déploiement » supposent le déploiement de la branche (dont la région `dub1`). Mesures : baseline = mesuré (audit) ; après = mesuré sur build local quand possible, sinon estimé à partir des poids/RT mesurés.

### Douleur 1 — Génération du rapport

| Métrique | AVANT (mesuré) | APRÈS |
|---|---|---|
| Premier signal visible | **28-60 s de silence** (progression fictive) | **< 2 s** (TTFT Anthropic mesuré 1,27 s + SSE, progression réelle par caractères) |
| Temps serveur hors LLM | ~750 ms (8 RT DB séquentiels iad1↔EU) | ~250 ms (3 RT) → **~15-50 ms après déploiement dub1** |
| Temps LLM | 28,2 s (1910 tokens à 68 tok/s) | inchangé — même modèle, même prompt, même sortie (iso-comportement) |
| Grosse visite (3000-5000 tokens) | 44-74 s → **mur maxDuration=60 s** | plus de mur : maxDuration 120 + connexion SSE jamais muette |
| Coût input Anthropic | plein tarif | −~90 % sur les ~1,1k tokens du système (prompt caching), traçable dans usage_logs |

### Douleur 2 — Transcription vocale (60 s de dictée, 4G médiocre 1 Mbps ↑)

| Métrique | AVANT | APRÈS |
|---|---|---|
| Poids audio | ~880 Ko/min (bitrate navigateur libre) | **~232 Ko/min** (opus 32k mono — qualité de transcription identique, vérifié) |
| Envois sur l'uplink | ×2 (Storage + FormData serveur) | **×1** (Storage seul ; `/api/transcribe` relit le fichier côté serveur via `{ path }`) |
| Temps réseau total | ~15-17 s | **~2-3 s (÷6-7)** |
| Pendant ce temps | boutons Photo/Vocal **gelés** | **libres** — l'item s'affiche immédiatement, la file tourne en arrière-plan |
| Groq (inchangé) | ~1-2 s | ~1-2 s |

### Douleur 3 — Photos (1,2 Mo moyen mesuré en prod, 4G médiocre)

| Métrique | AVANT | APRÈS |
|---|---|---|
| Bouton → vignette visible | ~10-12 s **bloqués** | **< 1 s** (vignette optimiste locale), envoi en arrière-plan avec badge « Envoi… » |
| Upload + insert | séquentiels | parallèles (+ rollback si échec d'upload) |
| « Décrire cette photo » | après l'upload | **immédiat** (le lien vocal↔photo attend l'id réel tout seul) |
| Vignettes timeline/rapport | pleine résolution (0,6-2 Mo/photo, 6-12 Mo pour 10 photos) | WebP redimensionné **~30-80 Ko (÷10-20)** via next/image ; **l'original est intact et servi au zoom** |

### Frontend (Lighthouse mobile 4G médiocre, /login, build prod local — mesuré avant ET après)

| Métrique | AVANT | APRÈS |
|---|---|---|
| Score performance | 76 | **90** |
| First Contentful Paint | 3,3 s | **0,8 s** |
| Speed Index | 8,8 s | **0,8 s** |
| LCP | 3,5 s | 3,5 s (l'élément LCP de /login n'était pas lié aux polices) |
| Requêtes Google Fonts externes | 1 (render-blocking) | **0** (Inter auto-hébergée next/font) |
| Pages blanches à la navigation | détail/visite/rapport/devis | supprimées (loading.tsx partout) |
| Navigation SSR (après déploiement dub1) | TTFB médiane ~340 ms, p90 1,4 s | **−200-400 ms estimés**/navigation (getUser + queries co-localisés) |

---

## 2. Commits (un levier = un commit)

| Commit | Levier |
|---|---|
| `375000c` | R1 — generate-report : 8 RT DB séquentiels → 3 (Promise.all + upsert + logUsage via after()) |
| `1e45a8f` | T2 — audio opus 32 kbps mono (÷3,8 sur le poids) |
| `a6c7bcd` | F1 — Inter via next/font (fin de l'@import bloquant) |
| `479ac86` | F2 — loading.tsx sur détail/visite/rapport/devis |
| `fb71012` | F3 — retrait html2canvas (jamais importé) |
| `0f2c235` | T1 — le blob audio ne monte qu'une fois (transcribe accepte { path }) |
| `91f42a8` | P2 — photo : upload et insert en parallèle + rollback |
| `6647489` | T3+P1 — file de captures non bloquante + vignettes optimistes |
| `722d666` | R2 — streaming SSE + progression réelle + maxDuration 120 |
| `d243f84` | R3 — prompt caching Anthropic |
| `9dbeba1` | P3 — vignettes next/image (transform Supabase indispo : 403 vérifié) |
| `e2e33c8` | R4 — regions dub1 (validé par Julien) |

## 3. Actions manuelles (Julien)

1. **Avant de déployer : confirmer la région Supabase** (dashboard → Settings → Infrastructure). Toutes les mesures pointent vers eu-west-1 → `dub1` est le bon choix. Si la région est autre, remplacer `dub1` dans `vercel.json` par la région Vercel la plus proche de la base.
2. **Déployer la branche** (ton process habituel — worktree isolé + `vercel --prod`). Deux points de vigilance au premier déploiement : (a) si le plan refuse `maxDuration = 120` sur generate-report, redescendre à 60 (noté dans le code) ; (b) vérifier que la région dub1 est acceptée sur le plan actuel.
3. **Après déploiement : recharger l'app sur les appareils ouverts.** Le contrat de `/api/generate-report` a changé (SSE) : un onglet resté ouvert avec l'ancien JS afficherait une erreur de génération jusqu'au rechargement.
4. **Quota image optimization Vercel** : les vignettes passent par l'optimiseur Vercel (plan Hobby = quota mensuel d'images source). À surveiller le premier mois ; si dépassement, on bascule sur un plan Supabase avec transform (le 403 mesuré indique que le plan actuel ne l'a pas).
5. **Optimisations encore sur la table (non appliquées)** : F4 `getClaims()` dans le middleware (−90-150 ms/navigation, nécessite d'activer les signing keys asymétriques dans le dashboard Supabase — dis-moi si tu veux qu'on le fasse) ; P4 compression photo (verrou : rien touché, comparatif visuel 1920/q0.8 vs 1600/q0.75 sur demande) ; F5 service worker (reporté V2, assumé).

## 4. Risques résiduels et régressions à surveiller

- **R2 (SSE)** : le changement de contrat client/serveur est le seul point structurel — surveillé par le re-test ; anciens clients non rechargés → erreur de génération (bénigne, rechargement).
- **T3 (file)** : les états intermédiaires changent (items optimistes). Cas limites couverts : échec d'upload → item retiré + alerte ; suppression bloquée pendant l'envoi ; « Générer le rapport » désactivé tant que la file n'est pas vide ; beforeunload si envois en vol. À surveiller sur le terrain : comportement en zone blanche totale (le retry 3× existant s'applique, puis alerte).
- **T2** : Safari iOS ignore éventuellement `audioBitsPerSecond` (hint) → retombe sur le comportement actuel, aucun risque.
- **after() (R1/R3)** : le log d'usage part après la réponse — si la fonction est tuée brutalement, une ligne usage_logs peut se perdre (le logging était déjà best-effort par conception).
- **`generation_logs`** : la table n'existe dans aucune migration (constat d'audit) — l'insert est ignoré comme avant. Si tu veux les stats, il faudra une migration (verrou DB, à ta main).

## 5. Checklist de re-test (à rejouer avant/après déploiement)

1. `npx tsc --noEmit && npm run lint && npm run build` verts sur la branche ✅ (fait).
2. **Visite complète en 4G simulée** (Chrome DevTools → Network → Slow 4G) : 5 photos + 3 vocaux **enchaînés sans attendre** → vignettes < 1 s, badges « Envoi… », transcriptions qui tombent au fil de l'eau, compteur sur « Générer le rapport » tant que la file draine.
3. **Génération** : barre de progression réelle (elle avance avec le texte, pas au chronomètre), rapport identique en structure à l'ancien (mêmes sections/légendes/photos — comparer sur un même chantier de test).
4. **Chaîne d'erreurs** : mode avion en cours de file (alerte + item retiré, pas d'item fantôme en DB) ; rechargement pendant un envoi (avertissement navigateur) ; « Terminer » bloqué pendant les envois.
5. **Zoom photo** : plein écran = pleine résolution (Hendrix doit juger le zoom identique).
6. **Non-régression adjacente** : export PDF, push devis Costructor, assistants ticket/devis (leurs dictées passent toujours par FormData), Telegram.
7. **Session M3 avant/après** (reste à faire — je lance `vercel logs`, tu rejoues 1 vocal + 2 photos + 1 génération sur la prod actuelle PUIS sur la nouvelle version déployée) : chiffres réels des durées de fonction pour le tableau définitif.
8. Vérifier dans usage_logs (après quelques générations) que `cache_read_tokens` > 0 (prompt caching actif).

*Phase 2/3 réalisées le 03/07/2026 — tout est sur la branche `perf/optim-mtc37-20260703`, aucun push sur main, aucun déploiement, aucun secret affiché.*
