# CLAUDE.md — Mémoire persistante du projet

> Ce fichier est lu au début de chaque session et mis à jour à la fin. Il constitue la mémoire de travail entre les sessions.

---

## 1. ÉTAT DU PROJET

**Nom :** Assistant de Visite Terrain IONNYX
**Version :** V2 (stable)
**Statut global :** MVP fonctionnel, toutes les features core sont implémentées.

### Fonctionnalités terminées
- **Authentification** — Login email/mot de passe via Supabase Auth (pas de signup public, comptes créés manuellement)
- **Liste des chantiers** — Dashboard avec cartes triées par date, badges de statut (Planifié / En cours / Terminé / Rapport généré)
- **Création/édition de chantier** — Formulaire avec infos client, adresse (avec autocomplétion), type de chantier (direct/sous-traitance), auto-save avec debounce 1s
- **Capture terrain (feature core)** — Timeline verticale chronologique mixant vocaux et photos :
  - Enregistrement audio (WebM/Opus) → transcription via Groq Whisper (<10s)
  - Prise de photo via caméra native → compression client-side (max 1920px, JPEG 0.8) → upload Supabase Storage
  - Édition inline des transcriptions, suppression avec confirmation
- **Génération de rapport IA** — Claude (claude-sonnet-4-20250514) analyse la timeline et produit un rapport structuré avec corrélation photos/observations
- **Affichage du rapport** — Observations groupées par tâche, photos associées avec légendes, édition inline, viewer photo plein écran
- **Export PDF** — Téléchargement local via html2canvas + jspdf
- **Middleware d'auth** — Protection des routes, redirection automatique

### Fonctionnalités en cours
- Aucune en cours actuellement

### Fonctionnalités non implémentées (prévues V2+)
- Mode offline avec queue de sync
- Export Google Drive automatique
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
| **IA rapport** | Anthropic Claude (pas OpenAI) | Meilleur raisonnement pour la corrélation sémantique photos/observations |
| **Transcription audio** | Groq Whisper (whisper-large-v3-turbo) | Rapide (<10s), bon support du français |
| **PDF** | html2canvas + jspdf + jspdf-autotable | Génération côté client, pas de dépendance serveur |
| **Compression images** | Client-side canvas (max 1920px, JPEG 0.8) | Réduit la bande passante sur les chantiers avec 4G variable |
| **Architecture** | Server components pour auth/data, Client components pour interactif | Séparation claire, hydration minimale |
| **Storage buckets** | `audio` (privé), `photos` (public) | Photos publiques nécessaires pour l'analyse IA |
| **Fichier `lib/openai.ts`** | Mal nommé — contient en réalité le client Anthropic | Héritage du switch GPT-4.1 → Claude, renommage pas encore fait |

---

## 3. CE QUI A MARCHÉ / CE QUI N'A PAS MARCHÉ

### Ce qui a marché
- **Architecture simple** — Pas d'over-engineering, composants directs, types stricts
- **Auto-save debounce** — UX fluide pour le formulaire chantier
- **Compression client-side** — Réduit drastiquement les temps d'upload sur le terrain
- **Timeline chronologique libre** — Les artisans capturent sans structure imposée, l'IA organise ensuite
- **RLS Supabase** — Isolation des données sans code custom côté serveur

### Ce qui n'a pas marché / Leçons apprises
- **Switch OpenAI → Anthropic** — Le fichier `lib/openai.ts` est encore mal nommé, source de confusion. À renommer.
- **Pas de mode offline en V1** — Choix assumé pour simplifier le MVP, mais c'est le premier besoin terrain remonté

### Bugs connus
- Aucun bug bloquant identifié à ce stade

---

## 4. PROCHAINES ÉTAPES

1. **Renommer `lib/openai.ts`** → `lib/anthropic.ts` (cohérence)
2. **Tester le flux complet** sur mobile réel (iPhone + Android)
3. **Mode offline** — Service worker + IndexedDB pour queue de sync
4. **Signup public** — Formulaire d'inscription avec validation email
5. **Export Google Drive** — Intégration API pour upload automatique du rapport
6. **Optimisations UX terrain** — Retours utilisateurs à intégrer

---

*Dernière mise à jour : 2026-04-01 — Session initiale : création du fichier CLAUDE.md, exploration complète du projet.*
