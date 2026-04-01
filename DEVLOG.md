# DEVLOG — Journal de bord du projet

> Chaque session de travail est notée ici chronologiquement. On ne supprime jamais rien.

---

## 26/03/2026 — Session 1 : Init projet
- Création du projet Next.js 14 (App Router) avec TypeScript + Tailwind CSS
- Scaffold initial via `create-next-app`
- Configuration de base (tsconfig, tailwind, postcss)

---

## 27/03/2026 — Session 2 : V1 complète
- Mise en place de Supabase (Auth + PostgreSQL + Storage)
- Création du schéma DB complet : `chantiers`, `capture_items`, `rapports` avec RLS
- Buckets storage : `audio` (privé) et `photos` (public)
- Page login email/mot de passe
- Dashboard liste des chantiers avec cartes et badges de statut
- Formulaire création/édition chantier avec auto-save (debounce 1s)
- Page de capture terrain : timeline verticale chronologique
  - Enregistrement audio (MediaRecorder, WebM/Opus)
  - Transcription via Groq Whisper (API route `/api/transcribe`)
  - Prise de photo via caméra native + compression client-side (canvas, max 1920px, JPEG 0.8)
  - Upload photos vers Supabase Storage
  - Édition inline des transcriptions, suppression avec confirmation
- Génération de rapport via OpenAI GPT-4.1 (API route `/api/generate-report`)
- Affichage du rapport structuré avec observations groupées par tâche
- Export PDF via html2canvas + jspdf
- Middleware d'auth pour protection des routes
- Manifest PWA (`public/manifest.json`)
- Rédaction du PRD et du prompt Claude Code

---

## 28/03/2026 — Session 3 : V2 — Migration Anthropic + améliorations UX
- **Migration OpenAI → Anthropic Claude** (claude-sonnet-4-20250514) pour la génération de rapport
  - Meilleur raisonnement pour la corrélation photos/observations
  - Fichier `lib/openai.ts` conservé (mal nommé, à renommer)
- **Autocomplétion d'adresse** — Nouveau composant `AddressAutocomplete.tsx` utilisant l'API adresse.data.gouv.fr
- **Améliorations UX terrain** :
  - Amélioration de l'`AudioRecorder` (feedback visuel)
  - Meilleure gestion des cartes chantier (`ChantierCard`)
  - Refonte partielle du formulaire chantier (`ChantierForm`)
- **Rapport amélioré** :
  - `ReportView` enrichi (+ de détails, meilleure mise en page)
  - `rapport-client.tsx` revu (+ d'interactions)
  - Export PDF amélioré (route `/api/export-pdf` refondue, +323 lignes)
- **Ajouts divers** :
  - Composant `UserMenu` (profil/déconnexion)
  - Nouveaux styles globaux (`globals.css`)
  - Types enrichis (`lib/types.ts`)
  - Prompts IA affinés (`lib/prompts.ts`)

---

## 01/04/2026 — Session 4 : Documentation projet
- Création du fichier `CLAUDE.md` — mémoire persistante du projet (état, décisions, leçons, prochaines étapes)
- Création du fichier `DEVLOG.md` — journal de bord chronologique
- Exploration complète du projet pour documenter l'état actuel
