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

## 01/04/2026 — Session 4 : Déploiement + Design + Features

### Déploiement GitHub & Vercel
- Push du projet vers GitHub (`julien118/visite-technique-ionnyx`)
- Configuration git : email `julien@ionnyx.fr` pour compatibilité Vercel Hobby
- Rebase de tous les commits avec le bon auteur + force push
- Bug fix build Vercel : `Buffer` → `new Uint8Array()` dans `/api/export-pdf`
- Déploiement réussi sur Vercel (`visite-technique-mtc37.vercel.app`)

### Header dynamique
- Nouvelle table `profiles` (migration `002_profiles_table.sql`) avec `company_name`
- Trigger auto-création de profil à l'inscription (`handle_new_user`)
- RLS sur la table profiles
- Header affiche `company_name` ("MTC37") au lieu de "Mes Chantiers" + email
- Sous-titre "Assistant de Visite"

### Suppression de chantier
- API route `DELETE /api/chantiers/[id]` avec nettoyage des fichiers Storage (audio + photos)
- Swipe gauche sur carte mobile → zone rouge avec icône poubelle
- Bouton poubelle discret sur desktop (gris → rouge au hover)
- Bouton "Supprimer ce chantier" en bas de la fiche chantier (texte rouge discret)
- Modale de confirmation réutilisable (`DeleteChantierModal.tsx`)
- Cascade DB via FK + RLS empêche suppression des chantiers d'autres users

### Filtres et recherche
- Onglets de filtre sticky : Tous | Planifiés | En cours | Finis | Rapports (avec compteurs)
- Barre de recherche temps réel sur nom/adresse/objet avec bouton X pour effacer
- Clavier mobile se ferme automatiquement au scroll de la liste
- Tri intelligent : En cours et Planifiés en premier (action requise), puis Terminés et Rapports
- Classe CSS `scrollbar-hide` pour masquer la scrollbar des onglets

### Refonte design liste des chantiers (3 itérations)
- Header MTC37 en `text-2xl bold` avec dégradé bleu (`from-[#1E3A5F] to-[#162d4a]`)
- Badges de statut colorés avec icônes :
  - Planifié → `bg-blue-100 text-blue-700` + icône calendrier
  - En cours → `bg-orange-100 text-orange-700` + icône micro
  - Terminé → `bg-yellow-100 text-yellow-700` + icône horloge
  - Rapport généré → `bg-green-100 text-green-700` + icône check
- Bande colorée `border-l-4` à gauche de chaque carte selon statut
- Cartes aérées `p-4` avec typographie hiérarchisée
- "Objet non renseigné" masqué (plus de placeholder inutile)
- Barre de recherche `bg-gray-50 border rounded-xl h-12` style iPhone
- Bouton "Nouvelle visite" avec `shadow-lg shadow-orange-200` + safe-area iPhone
- Onglets raccourcis ("Finis" au lieu de "Terminés") + padding de fin pour visibilité
- Espacement : `gap-3` entre cartes, 16px entre onglets/recherche/liste

### Documentation
- Création `CLAUDE.md` (mémoire persistante du projet)
- Création `DEVLOG.md` (journal de bord chronologique)
