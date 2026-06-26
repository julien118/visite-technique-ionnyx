# PRD — Assistant de Visite Terrain IONNYX

> Document généré le 11 avril 2026 — Description exhaustive de l'application telle qu'elle fonctionne aujourd'hui.
> Objectif : servir de base pour reconstruire une version différente du projet.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Structure des fichiers](#3-structure-des-fichiers)
4. [Modèle de données](#4-modèle-de-données)
5. [Authentification & sécurité](#5-authentification--sécurité)
6. [Parcours utilisateur complet](#6-parcours-utilisateur-complet)
7. [Fonctionnalités détaillées — Écran par écran](#7-fonctionnalités-détaillées--écran-par-écran)
8. [Logique métier clé](#8-logique-métier-clé)
9. [Intégrations externes](#9-intégrations-externes)
10. [Design system & CSS](#10-design-system--css)
11. [PWA & mobile](#11-pwa--mobile)
12. [Variables d'environnement](#12-variables-denvironnement)
13. [Règles métier critiques](#13-règles-métier-critiques)

---

## 1. Vue d'ensemble

**Assistant de Visite IONNYX** est une application SaaS mobile-first destinée aux artisans du bâtiment. Elle permet de documenter des visites de chantier en capturant photos et observations vocales sur le terrain, puis de générer automatiquement un rapport de visite structuré via l'IA (Claude d'Anthropic).

### Proposition de valeur

L'artisan arrive sur le chantier, ouvre l'app, prend des photos et dicte ses observations. L'IA corrèle automatiquement les photos aux descriptions vocales et produit un rapport professionnel structuré, exportable en PDF ou sauvegardé sur Google Drive.

### Utilisateurs cibles

Artisans du bâtiment (maçons, couvreurs, plombiers…), entreprises de travaux, bureaux d'études techniques. Pas de signup public — les comptes sont créés manuellement dans Supabase.

---

## 2. Architecture technique

### Stack

| Couche | Technologie | Version | Rôle |
|--------|------------|---------|------|
| Framework | Next.js (App Router) | 14.2.35 | SSR, routing, API routes, Server/Client Components |
| UI | React | 18.x | Composants interactifs |
| Langage | TypeScript | 5.9.3 | Typage strict (`strict: true`) |
| CSS | Tailwind CSS | 3.4.1 | Styling utility-first, mobile-first |
| Police | Inter (Google Fonts) | — | Police principale via CSS import |
| Auth | Supabase Auth | — | Email/password, session cookies |
| BDD | Supabase PostgreSQL | — | Tables avec RLS (Row Level Security) |
| Storage | Supabase Storage | — | Buckets `audio` (privé) et `photos` (public) |
| IA rapport | Anthropic Claude | claude-sonnet-4-20250514 | Génération de rapport structuré JSON |
| Transcription | Groq Whisper | whisper-large-v3-turbo | Transcription audio → texte (français) |
| PDF | jsPDF + jspdf-autotable | 4.2.1 / 5.0.7 | Génération PDF côté serveur |
| Google Drive | googleapis | 171.4.0 | Upload PDF via OAuth2 |
| Compression images | Canvas API native | — | Compression JPEG côté client |
| Hébergement | Vercel | — | Auto-deploy depuis GitHub |

### Patterns architecturaux

- **Server Components** pour l'auth et le fetch de données (pages)
- **Client Components** (`'use client'`) pour toute interactivité (formulaires, capture, modales)
- **API Routes** Next.js pour la logique serveur (transcription, génération rapport, export PDF, Drive)
- **RLS Supabase** pour l'isolation des données par utilisateur (pas de code serveur custom)
- **Pas de state manager global** — `useState`/`useRef`/`useCallback`/`useMemo` locaux suffisent
- **Path alias** `@/*` vers la racine du projet

---

## 3. Structure des fichiers

```
/
├── app/
│   ├── layout.tsx                    # Layout racine (metadata, fonts, body)
│   ├── page.tsx                      # Redirect → /chantiers
│   ├── globals.css                   # Tailwind + custom CSS (boutons, inputs, animations)
│   ├── favicon.ico
│   ├── icon.png
│   ├── fonts/
│   │   ├── GeistVF.woff
│   │   └── GeistMonoVF.woff
│   │
│   ├── login/
│   │   └── page.tsx                  # Page de connexion (Client Component)
│   │
│   ├── chantiers/
│   │   ├── page.tsx                  # Liste des chantiers (Server Component)
│   │   ├── chantiers-list.tsx        # Liste interactive (Client Component)
│   │   ├── nouveau/
│   │   │   └── page.tsx              # Création chantier (Server Component → ChantierForm)
│   │   └── [id]/
│   │       ├── page.tsx              # Détail/édition chantier (Server Component → ChantierForm)
│   │       ├── visite/
│   │       │   ├── page.tsx          # Page visite (Server Component)
│   │       │   └── visite-client.tsx  # Capture terrain (Client Component)
│   │       └── rapport/
│   │           ├── page.tsx          # Page rapport (Server Component)
│   │           └── rapport-client.tsx # Affichage/export rapport (Client Component)
│   │
│   └── api/
│       ├── auth/
│       │   ├── signout/route.ts      # POST — Déconnexion
│       │   └── google/
│       │       ├── route.ts          # GET — Initiation OAuth Google Drive
│       │       └── callback/route.ts # GET — Callback OAuth Google Drive
│       ├── chantiers/
│       │   └── [id]/route.ts         # DELETE — Suppression chantier + cleanup
│       ├── transcribe/route.ts       # POST — Transcription audio via Groq
│       ├── generate-report/route.ts  # POST — Génération rapport via Claude
│       ├── export-pdf/route.ts       # POST — Génération PDF
│       └── drive/
│           └── upload-rapport/route.ts # POST — Upload PDF vers Google Drive
│
├── components/
│   ├── AddressAutocomplete.tsx       # Autocomplétion adresse (API gouv)
│   ├── AudioRecorder.tsx             # Enregistrement vocal
│   ├── CaptureItem.tsx               # Affichage item timeline (photo/vocal/lié)
│   ├── ChantierCard.tsx              # Carte chantier dans la liste
│   ├── ChantierForm.tsx              # Formulaire création/édition chantier
│   ├── DeleteChantierModal.tsx       # Modale confirmation suppression
│   ├── PhotoCapture.tsx              # Capture photo (caméra/galerie)
│   ├── ReportView.tsx                # Rendu du rapport avec édition inline
│   ├── StatusBadge.tsx               # Badge statut coloré
│   └── UserMenu.tsx                  # Menu utilisateur (déconnexion)
│
├── lib/
│   ├── openai.ts                     # Client Anthropic Claude (mal nommé, historique)
│   ├── prompts.ts                    # System prompt + user prompt builder
│   ├── types.ts                      # Interfaces TypeScript
│   ├── utils.ts                      # Utilitaires (dates, compression image)
│   └── supabase/
│       ├── client.ts                 # Client navigateur (createBrowserClient)
│       ├── server.ts                 # Client serveur (createServerClient)
│       └── middleware.ts             # Session refresh + redirections auth
│
├── public/
│   ├── manifest.json                 # PWA manifest
│   ├── icon-192.png                  # Icône PWA 192px
│   └── icon-512.png                  # Icône PWA 512px
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    # Tables chantiers, capture_items, rapports + RLS + storage
│       ├── 002_profiles_table.sql    # Table profiles + trigger auto-création
│       ├── 003_linked_photo_id.sql   # Colonne linked_photo_id sur capture_items
│       └── 004_google_drive_tokens.sql # Colonnes OAuth Google Drive sur profiles
│
├── middleware.ts                      # Middleware Next.js → session Supabase
├── next.config.mjs                   # Config Next.js (vide, défauts)
├── tailwind.config.ts                # Config Tailwind
├── tsconfig.json                     # Config TypeScript (strict)
├── package.json
└── CLAUDE.md                         # Mémoire projet inter-sessions
```

---

## 4. Modèle de données

### 4.1 Table `chantiers`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Identifiant unique |
| `user_id` | UUID | FK → auth.users, NOT NULL, ON DELETE CASCADE | Propriétaire |
| `client_prenom` | TEXT | | Prénom du client |
| `client_nom` | TEXT | | Nom du client |
| `client_adresse` | TEXT | | Adresse du chantier |
| `client_telephone` | TEXT | | Téléphone client |
| `client_email` | TEXT | | Email client |
| `date_visite` | TIMESTAMPTZ | | Date et heure de la visite |
| `objet_travaux` | TEXT | | Description des travaux |
| `provenance` | TEXT | | Source/origine du chantier |
| `type_chantier` | ENUM | 'direct' \| 'sous_traitance' | Type de relation client |
| `statut` | ENUM | 'planifie' \| 'en_cours' \| 'termine' \| 'rapport_genere' | État du chantier |
| `created_at` | TIMESTAMPTZ | default now() | Date de création |
| `updated_at` | TIMESTAMPTZ | default now(), trigger auto-update | Dernière modification |

**Index :** `idx_chantiers_user_id`, `idx_chantiers_date_visite`

**RLS :** SELECT/INSERT/UPDATE/DELETE restreints à `auth.uid() = user_id`

### 4.2 Table `capture_items`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `chantier_id` | UUID | FK → chantiers, ON DELETE CASCADE | Chantier parent |
| `type` | ENUM | 'vocal' \| 'photo' | Type de capture |
| `position` | INTEGER | | Ordre chronologique dans la timeline |
| `audio_url` | TEXT | | URL signée vers le fichier audio (bucket privé, 1 an) |
| `transcription` | TEXT | | Texte transcrit par Whisper (NULL initialement) |
| `photo_url` | TEXT | | URL publique de la photo |
| `linked_photo_id` | UUID | FK → capture_items, ON DELETE SET NULL | Liaison explicite vocal → photo |
| `created_at` | TIMESTAMPTZ | default now() | Date de capture |

**Index :** `idx_capture_items_chantier_id`, `idx_capture_items_position`, `idx_capture_items_linked_photo`

**RLS :** Accès via ownership du chantier parent (`chantier.user_id = auth.uid()`)

### 4.3 Table `rapports`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `chantier_id` | UUID | FK → chantiers, UNIQUE, ON DELETE CASCADE | Un seul rapport par chantier |
| `contenu_json` | JSONB | | Rapport structuré (type `RapportContenu`) |
| `contenu_html` | TEXT | | Version HTML (non utilisé actuellement) |
| `pdf_url` | TEXT | | URL du PDF (non utilisé actuellement) |
| `created_at` | TIMESTAMPTZ | default now() | Date de génération |
| `updated_at` | TIMESTAMPTZ | default now(), trigger auto-update | Dernière modification |

**Index :** `idx_rapports_chantier_id` (UNIQUE)

**RLS :** Accès via ownership du chantier parent

### 4.4 Table `profiles`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | UUID | PK, FK → auth.users | Même ID que l'utilisateur auth |
| `company_name` | TEXT | | Nom de l'entreprise (affiché dans le header) |
| `google_access_token` | TEXT | | Token d'accès Google Drive |
| `google_refresh_token` | TEXT | | Token de rafraîchissement Google Drive |
| `google_token_expiry` | TIMESTAMPTZ | | Expiration du token d'accès |
| `created_at` | TIMESTAMPTZ | default now() | |
| `updated_at` | TIMESTAMPTZ | default now() | |

**RLS :** SELECT/UPDATE restreints à `auth.uid() = id`

**Trigger :** `handle_new_user()` — crée automatiquement une ligne `profiles` quand un utilisateur s'inscrit dans `auth.users`

### 4.5 Storage Supabase

| Bucket | Visibilité | Chemin des fichiers | Format |
|--------|-----------|---------------------|--------|
| `photos` | **Public** | `{userId}/{chantierId}/{timestamp}.jpg` | JPEG compressé |
| `audio` | **Privé** (signed URLs) | `{userId}/{chantierId}/{timestamp}.webm` | WebM/Opus |

**Politique RLS Storage :**
- `photos` : upload/delete restreints au dossier `user_id/`, lecture publique
- `audio` : upload/read/delete restreints au dossier `user_id/`

### 4.6 Diagramme des relations

```
auth.users (Supabase Auth)
    │
    ├─── 1:1 ──→ profiles (company_name, google tokens)
    │
    └─── 1:N ──→ chantiers
                    │
                    ├─── 1:N ──→ capture_items
                    │               │
                    │               └── linked_photo_id ──→ capture_items (self-ref)
                    │
                    └─── 1:1 ──→ rapports
```

### 4.7 Interfaces TypeScript

```typescript
type ChantierStatut = 'planifie' | 'en_cours' | 'termine' | 'rapport_genere'
type TypeChantier = 'direct' | 'sous_traitance'
type CaptureType = 'vocal' | 'photo'

interface Chantier {
  id: string; user_id: string;
  client_prenom: string; client_nom: string; client_adresse: string;
  client_telephone: string; client_email: string;
  date_visite: string; objet_travaux: string; provenance: string;
  type_chantier: TypeChantier; statut: ChantierStatut;
  created_at: string; updated_at: string;
}

interface CaptureItem {
  id: string; chantier_id: string;
  type: CaptureType; position: number;
  audio_url: string | null; transcription: string | null;
  photo_url: string | null; linked_photo_id: string | null;
  created_at: string;
}

interface RapportObservationPhoto { url: string; legende: string; }
interface RapportObservation {
  titre: string; description: string;
  points_vigilance: string[];
  photos: RapportObservationPhoto[];
}

interface RapportContenu {
  client: {
    prenom: string; nom: string; adresse: string;
    telephone: string; email: string; date_visite: string;
    provenance: string; type_chantier: string;
  };
  observations: RapportObservation[];
  acces_chantier: string;
  duree_estimee: string;
  notes: string;
}
```

---

## 5. Authentification & sécurité

### 5.1 Flux de connexion

1. L'utilisateur accède à n'importe quelle URL
2. Le middleware Next.js (`middleware.ts`) intercepte la requête
3. `updateSession()` vérifie/rafraîchit la session Supabase via cookies
4. Si pas de session → redirect vers `/login`
5. Si session valide + URL = `/login` → redirect vers `/chantiers`

### 5.2 Page de login

- Formulaire email + mot de passe
- Appel `supabase.auth.signInWithPassword({ email, password })`
- En cas d'erreur → message d'erreur affiché
- En cas de succès → `router.refresh()` puis redirect vers `/chantiers`
- Pas de formulaire d'inscription (comptes créés manuellement)

### 5.3 Déconnexion

- Composant `UserMenu` dans le header
- POST vers `/api/auth/signout`
- Appel `supabase.auth.signOut()`
- Redirect vers `/login`

### 5.4 Isolation des données

- **Toutes les tables** ont des politiques RLS activées
- Un utilisateur ne peut voir/modifier/supprimer que ses propres données
- Les API routes vérifient également l'authentification via `supabase.auth.getUser()`
- Le storage impose des chemins de fichiers préfixés par `user_id/`

### 5.5 Routes protégées

Le middleware s'applique à toutes les routes **sauf** :
- `_next/static`, `_next/image` (assets Next.js)
- `favicon.ico`, `icon-*.png`, `manifest.json` (assets statiques)
- `api/*` (les API routes gèrent leur propre auth)

---

## 6. Parcours utilisateur complet

### Flux principal

```
Login → Liste chantiers → Créer/Éditer chantier → Visite terrain → Rapport IA → Export PDF / Drive
```

### Détail pas à pas

#### 1. Connexion
- L'utilisateur ouvre l'app → redirigé vers `/login`
- Saisit email + mot de passe → connecté → arrive sur `/chantiers`

#### 2. Dashboard (Liste des chantiers)
- Voit le header avec le nom de son entreprise (ex: "MTC37")
- Voit ses chantiers organisés par onglets : Tous | Planifiés | En cours | Finis | Rapports
- Peut chercher par nom/adresse/objet via la barre de recherche
- Peut supprimer un chantier par appui long (600ms) → modale de confirmation
- Clique sur le bouton flottant "Nouvelle visite" pour créer un chantier

#### 3. Création/Édition de chantier
- Remplit le formulaire : nom, prénom, adresse (avec autocomplétion), téléphone, email, date, objet, provenance, type
- Chaque modification est auto-sauvegardée (debounce 1s)
- Clique "Démarrer la visite" → statut passe à `en_cours` → redirigé vers la page visite

#### 4. Visite terrain (capture)
- **Prendre une photo** → compressée côté client → uploadée → apparaît dans la timeline
- Après chaque photo, un compte à rebours de 10s propose de "Décrire cette photo"
- **Enregistrer un vocal** → uploadé → transcrit par Whisper → texte affiché
- Si le vocal est enregistré pendant le compte à rebours photo, il est **lié explicitement** à la photo
- La timeline affiche les items chronologiquement (photos et vocaux mélangés)
- Les items liés (photo + vocal) sont groupés dans une seule carte
- L'utilisateur peut supprimer des items individuellement
- L'utilisateur peut éditer une transcription en cliquant dessus
- Clique "Terminer la visite" → modale récapitulative → statut passe à `termine` → redirigé vers le rapport

#### 5. Rapport IA
- Le rapport est généré automatiquement à l'ouverture si aucun rapport n'existe
- Barre de progression animée pendant la génération
- Le rapport affiche : infos client, observations groupées avec photos légendées, points de vigilance, accès chantier, durée estimée, notes
- L'utilisateur peut **éditer** les descriptions d'observation (clic → textarea)
- L'utilisateur peut **voir les photos en plein écran** (zoom, pan, double-tap zoom)
- L'utilisateur peut **régénérer** le rapport
- L'utilisateur peut **prévisualiser le PDF** dans un iframe lightbox
- L'utilisateur peut **télécharger le PDF**
- L'utilisateur peut **partager** via Web Share API ou copie du lien
- L'utilisateur peut **sauvegarder sur Google Drive** (OAuth si pas encore connecté)

#### 6. Retour au dashboard
- Navigation via le bouton "Accueil" dans le header
- Le chantier apparaît avec le statut "Rapport" (badge vert)

---

## 7. Fonctionnalités détaillées — Écran par écran

### 7.1 Login (`/login`)

**Type :** Client Component

**UI :**
- Header avec gradient et icône bâtiment
- Formulaire avec 2 champs : email, mot de passe
- Labels flottants (animation focus)
- Bouton "Se connecter" (btn-primary)
- Message d'erreur rouge si échec

**État :**
- `email`, `password` : valeurs du formulaire
- `error` : message d'erreur
- `loading` : spinner pendant l'auth
- `emailFocused`, `passwordFocused` : animation des labels

**Logique :**
- `handleSubmit()` → `supabase.auth.signInWithPassword()` → `router.refresh()`

---

### 7.2 Liste des chantiers (`/chantiers`)

**Type :** Server Component (page) + Client Component (liste)

**Server Component (`page.tsx`) :**
- Fetch user via `supabase.auth.getUser()`
- Fetch `profiles.company_name`
- Fetch tous les `chantiers` ordonnés par `date_visite DESC`
- Passe les données à `<ChantiersList />`

**Client Component (`chantiers-list.tsx`) :**

**UI :**
- Header noir fixe : logo IONNYX, nom entreprise, UserMenu
- Onglets sticky avec compteurs : Tous (N) | Planifiés (N) | En cours (N) | Finis (N) | Rapports (N)
- Barre de recherche avec bouton X (se ferme au scroll)
- Liste scrollable de `<ChantierCard />`
- Bouton flottant vert "Nouvelle visite" en bas à droite
- Modale `<DeleteChantierModal />` sur appui long

**État :**
- `chantiers` : tableau de chantiers
- `activeTab` : onglet actif (`'tous'` | `'planifie'` | `'en_cours'` | `'termine'` | `'rapport_genere'`)
- `search` : terme de recherche
- `deleteTarget` : chantier sélectionné pour suppression
- `deleting` : suppression en cours

**Tri intelligent :**
1. Par priorité de statut : `en_cours` > `planifie` > `termine` > `rapport_genere`
2. Puis par `date_visite` décroissante

**Recherche :**
- Filtre sur `client_prenom`, `client_nom`, `client_adresse`, `objet_travaux`
- Comparaison insensible à la casse
- Temps réel à chaque frappe

**Suppression :**
1. Appui long 600ms sur une carte → vibration haptic → `deleteTarget` set
2. Modale de confirmation (nom + adresse du client)
3. Si confirmé → `DELETE /api/chantiers/{id}` → retrait de la liste
4. L'API supprime : fichiers storage (audio + photos) + enregistrement DB (cascade)

---

### 7.3 ChantierCard (composant)

**Props :** `chantier`, `onLongPress`

**UI :**
- Carte blanche avec bande colorée à gauche (`border-l-4`) selon statut
- Nom client en gras, adresse en gris
- Objet des travaux (clamp 2 lignes)
- Date de visite formatée
- `<StatusBadge />` à droite

**Couleurs bande gauche :**
- `planifie` → emerald-500
- `en_cours` → amber-500
- `termine` → gray-400
- `rapport_genere` → emerald-500

**Interactions :**
- Clic normal → navigation vers `/chantiers/{id}`
- Appui long (600ms) → `navigator.vibrate(50)` + callback `onLongPress`

---

### 7.4 Formulaire chantier (`/chantiers/nouveau` et `/chantiers/[id]`)

**Type :** Server Component (page) + Client Component (formulaire)

**Server Component :**
- Si `[id]` : fetch le chantier existant, passe en prop
- Si `nouveau` : pas de données initiales

**ChantierForm (Client Component) :**

**Champs du formulaire :**
| Champ | Type | Requis | Notes |
|-------|------|--------|-------|
| Prénom | text | Oui (pour save) | |
| Nom | text | Oui (pour save) | |
| Adresse | AddressAutocomplete | Non | API adresse.data.gouv.fr |
| Objet des travaux | textarea | Non | |
| Téléphone | tel | Non | |
| Email | email | Non | |
| Date | date | Non | Champs date + heure séparés |
| Heure | time | Non | |
| Provenance | text | Non | |
| Type | radio | Non | "Direct client" ou "Sous-traitance" |

**Auto-save :**
- Déclenché au `onBlur` de chaque champ
- Debounce de 1 seconde via `setTimeout`
- Si nouveau chantier → `INSERT` + mise à jour de l'URL avec le nouvel ID
- Si existant → `UPDATE`
- Feedback visuel : "Sauvegardé ✓" (vert) ou "Erreur" (rouge)

**Bouton d'action principal (selon statut) :**
| Statut | Label | Action |
|--------|-------|--------|
| `planifie` | "Démarrer la visite" | Status → `en_cours`, redirect → `/visite` |
| `en_cours` | "Reprendre la visite" | Redirect → `/visite` |
| `termine` | "Reprendre la visite" | Redirect → `/visite` |
| `rapport_genere` | "Voir le rapport" | Redirect → `/rapport` |

**Suppression :**
- Bouton "Supprimer ce chantier" en bas du formulaire
- Ouvre `<DeleteChantierModal />`

---

### 7.5 AddressAutocomplete (composant)

**API :** `https://api-adresse.data.gouv.fr/search/?q={query}&limit=5`

**Comportement :**
- Attend 3 caractères minimum
- Debounce de 300ms
- Affiche une dropdown de suggestions (adresse + contexte/ville)
- Au clic sur une suggestion → remplit le champ, ferme la dropdown
- Au clic en dehors → ferme la dropdown

---

### 7.6 Visite terrain (`/chantiers/[id]/visite`)

**Type :** Server Component (page) + Client Component (visite-client)

**Server Component :**
- Fetch chantier + tous les `capture_items` ordonnés par `position ASC`
- Passe les données à `<VisiteClient />`

**VisiteClient (Client Component) — Composant le plus complexe de l'app :**

**UI Layout (3 zones fixes) :**
```
┌─────────────────────────────┐
│  HEADER FIXE                │ ← Nom client, adresse, compteurs, bouton "Terminer"
├─────────────────────────────┤
│                             │
│  TIMELINE SCROLLABLE        │ ← Items chronologiques (photos, vocaux, liés)
│                             │
├─────────────────────────────┤
│  BARRE D'ACTIONS FIXE      │ ← AudioRecorder + PhotoCapture (ou mode "Décrire")
└─────────────────────────────┘
```

**État :**
- `items` : tableau de CaptureItem
- `processing` : upload/transcription en cours
- `isRecording` : enregistrement audio actif
- `lastPhotoItem` : dernière photo prise (pour liaison)
- `lastPhotoTimestamp` : timestamp de la dernière photo
- `describeCountdown` : compte à rebours 10s pour décrire la photo
- `showEndConfirm` : modale de fin de visite visible

**Flux photo (`handlePhotoTaken`) :**
1. Appel `compressImage(file)` → Blob JPEG (max 1920px, qualité 0.8)
2. Upload vers Supabase Storage bucket `photos` avec retry exponentiel (3 tentatives, délais 1s/2s/4s)
3. Récupération URL publique
4. Insert dans `capture_items` (type='photo', position=next)
5. Set `lastPhotoItem` + démarrage countdown 10s ("Décrire cette photo")
6. La barre d'actions passe en mode "describe" (bouton micro + bouton photo compact)

**Flux audio (`handleRecordingComplete`) :**
1. Upload vers Supabase Storage bucket `audio` avec retry exponentiel
2. Création URL signée (validité 365 jours)
3. Insert dans `capture_items` (type='vocal', position=next)
4. Si mode "describe" actif OU dernière photo < 30s → `linked_photo_id = lastPhotoItem.id`
5. POST `/api/transcribe` avec le blob audio
6. Update `capture_items.transcription` avec le texte retourné
7. Reset du mode describe

**Liaison photo-vocal (logique `shouldLinkToPhoto`) :**
- Activée quand l'utilisateur clique "Décrire cette photo" après une capture photo
- Compte à rebours visible de 10 secondes dans l'UI
- Fenêtre étendue de 30 secondes depuis la capture photo
- La liaison est stockée via `linked_photo_id` dans `capture_items`
- Un vocal lié à une photo sera marqué `[LIÉ À PHOTO #position]` dans le prompt IA

**Groupement d'affichage :**
- Les items photo + vocal liés sont fusionnés dans une seule carte (LinkedCard)
- Les vocaux liés sont masqués de la liste principale (affichés dans la carte photo)
- Les items non liés sont affichés individuellement (VocalCard ou PhotoCard)

**Auto-scroll :**
- Scroll automatique vers le bas quand un nouvel item est ajouté
- Seulement si l'utilisateur est déjà proche du bas (pas de scroll forcé si l'utilisateur remonte)

**Suppression d'item :**
- Bouton poubelle sur chaque carte
- Item solo : suppression simple
- Item groupé (photo + vocal lié) : suppression des deux items
- Réorganisation des positions restantes non nécessaire (positions sont des ordres, pas des indices)

**Édition de transcription :**
- Clic sur le texte de transcription → passage en mode édition (textarea)
- Blur ou Enter → sauvegarde dans la BDD

**Fin de visite :**
1. Bouton "Terminer" dans le header
2. Modale de confirmation avec compteurs (X photos, Y vocaux)
3. Si confirmé → Update chantier `statut = 'termine'`
4. Redirect vers `/chantiers/{id}/rapport`

---

### 7.7 AudioRecorder (composant)

**Deux variantes :**
- `variant='default'` : bouton micro standard (cercle émeraude)
- `variant='describe'` : bouton "Décrire cette photo" avec countdown

**Comportement :**
1. Clic → `navigator.mediaDevices.getUserMedia({ audio: true })`
2. Crée un `MediaRecorder` avec `mimeType: 'audio/webm;codecs=opus'`
3. Pendant l'enregistrement : bouton rouge pulsant + texte "Stop" + durée
4. Clic stop → `mediaRecorder.stop()` → collecte des chunks → `new Blob(chunks, { type: 'audio/webm' })`
5. Callback `onRecordingComplete(blob)` vers le parent

---

### 7.8 PhotoCapture (composant)

**Deux modes :**
- Normal : grand bouton photo
- Compact : petit bouton (en mode "describe")

**Comportement :**
1. Clic → bottom sheet avec 2 options :
   - "Prendre une photo" → `<input type="file" accept="image/*" capture="environment" />`
   - "Choisir dans la galerie" → `<input type="file" accept="image/*" />`
2. Sélection → callback `onPhotoTaken(file)` vers le parent

---

### 7.9 Rapport (`/chantiers/[id]/rapport`)

**Type :** Server Component (page) + Client Component (rapport-client)

**Server Component :**
- Fetch chantier + rapport existant (si any)
- Fetch `profiles.google_refresh_token` pour savoir si Drive est connecté
- Passe tout à `<RapportClient />`

**RapportClient (Client Component) :**

**État :**
- `rapport` : RapportContenu JSON (null si pas encore généré)
- `generating` : génération en cours
- `currentStep` : étape de progression (0-4)
- `error` : message d'erreur
- `driveStatus` : 'idle' | 'uploading' | 'success' | 'error'
- `driveLink` : URL du fichier sur Drive
- `showPdfPreview` : lightbox PDF visible
- `pdfBlobUrl` : URL blob du PDF pour l'iframe
- `loadingPdf` : chargement PDF en cours

**Génération automatique :**
- Si `rapport` est null au montage → lance `handleGenerate()` automatiquement
- Barre de progression avec 4 étapes animées :
  1. "Analyse des captures..."
  2. "Corrélation photos/observations..."
  3. "Rédaction du rapport..."
  4. "Finalisation..."

**Flux de génération :**
1. POST `/api/generate-report` avec `{ chantierId }`
2. Le serveur fetch les capture_items, appelle Claude, parse le JSON
3. Audit des photos (ajout des manquantes à "Photos supplémentaires")
4. Upsert dans `rapports` + update statut chantier → `rapport_genere`
5. Retour du JSON structuré → rendu par `<ReportView />`

**Barre d'actions (5 boutons) :**
| Bouton | Icône | Action |
|--------|-------|--------|
| Régénérer | 🔄 | Clear rapport + re-fetch → nouvelle génération |
| Prévisualiser PDF | 👁️ | POST `/api/export-pdf` → iframe lightbox |
| Télécharger PDF | ⬇️ | Depuis la preview → `<a download>` |
| Partager | 📤 | `navigator.share()` ou `navigator.clipboard.writeText()` |
| Google Drive | ☁️ | POST `/api/drive/upload-rapport` ou OAuth si pas connecté |

---

### 7.10 ReportView (composant)

**Props :** `contenu: RapportContenu`, `onUpdate: (contenu) => void`

**Rendu du rapport :**
- **Section client** : tableau avec prénom, nom, adresse, téléphone, email, date, provenance, type
- **Observations** : pour chaque observation :
  - Titre (h3)
  - Description (texte avec support `**bold**` via regex)
  - Photos cliquables (miniatures → viewer plein écran)
  - Légendes sous chaque photo
  - Points de vigilance (liste à puces dans un encadré vert)
- **Accès chantier** (si renseigné)
- **Durée estimée** (si renseignée)
- **Notes** (si renseignées)

**Édition inline :**
- Clic sur une description d'observation → textarea
- Blur → sauvegarde via `onUpdate()` → update BDD

**Viewer photo plein écran :**
- Fond noir, photo centrée
- Zoom par pincement (touch) et double-tap
- Pan par glissement
- Bouton fermer (X)

---

## 8. Logique métier clé

### 8.1 Compression d'image côté client

**Fichier :** `lib/utils.ts` → `compressImage()`

```
Entrée : File (image brute de la caméra, souvent 3-8 MB)
Sortie : Blob JPEG compressé

Paramètres :
- maxWidth = 1920px (pas d'upscaling si plus petit)
- quality = 0.8 (80% JPEG)

Processus :
1. Charger le fichier en tant qu'Image via URL.createObjectURL()
2. Calculer le ratio : min(maxWidth / width, 1)
3. Créer un canvas aux dimensions réduites
4. Dessiner l'image redimensionnée sur le canvas
5. Convertir en Blob JPEG via canvas.toBlob('image/jpeg', 0.8)
```

### 8.2 Transcription vocale (Groq Whisper)

**Endpoint :** `POST /api/transcribe`

```
Entrée : FormData avec champ "file" (Blob audio WebM/Opus)

Processus :
1. Extraire le fichier audio du FormData
2. Créer un nouveau FormData pour Groq :
   - file: blob renommé en "audio.webm"
   - model: "whisper-large-v3-turbo"
   - language: "fr"
   - response_format: "json"
3. POST vers https://api.groq.com/openai/v1/audio/transcriptions
4. Header: Authorization: Bearer {GROQ_API_KEY}

Sortie : { text: "transcription en français" }
```

### 8.3 Génération de rapport IA (Claude)

**Endpoint :** `POST /api/generate-report`

#### System prompt complet (dans `lib/prompts.ts`)

Le system prompt instruit Claude de :
1. **Analyser** un flux chronologique mixte (vocaux + photos) capté pendant une visite
2. **Corréler** chaque photo à l'observation la plus pertinente selon des règles de proximité :
   - `[LIÉ À PHOTO #X]` → liaison explicite (priorité absolue)
   - VOCAL puis PHOTO → la photo illustre le vocal
   - PHOTO puis VOCAL → le vocal décrit la photo
   - Plusieurs PHOTOS entre 2 vocaux → rattacher sémantiquement
3. **Produire** un JSON structuré avec observations groupées

**Règles obligatoires :**
- Légendes de photos descriptives et concrètes (jamais "Vue du chantier")
- Mesures en **gras markdown** (`**5,36 m**`, `**parpaing de 20**`)
- Corrélation photo-observation évidente dans la légende
- Données client recopiées à l'identique
- **Aucune photo perdue** — chaque URL doit apparaître exactement une fois

#### User prompt (construit par `buildUserPrompt()`)

```
INFORMATIONS CLIENT :
- Prénom : Jean
- Nom : Dupont
- Adresse : 12 rue des Lilas, 38000 Grenoble
- Téléphone : 06 12 34 56 78
- Email : jean@example.com
- Date de visite : 2026-04-10
- Objet des travaux : Ouverture mur porteur
- Provenance : Recommandation
- Type de chantier : Direct client

FLUX CHRONOLOGIQUE DE LA VISITE :
VOCAL #1 (position 1) : "Alors là on est devant le mur porteur, il fait 5 mètres 36..."
PHOTO #2 (position 2) : https://...supabase.co/storage/v1/object/public/photos/...
VOCAL #3 (position 3) [LIÉ À PHOTO #2] : "C'est le mur qu'on doit ouvrir..."
PHOTO #4 (position 4) : https://...supabase.co/storage/v1/object/public/photos/...

Génère le rapport structuré en JSON. Réponds UNIQUEMENT avec le JSON, sans commentaire.
```

#### Appel API Anthropic

```
POST https://api.anthropic.com/v1/messages
Headers:
  Content-Type: application/json
  x-api-key: {ANTHROPIC_API_KEY}
  anthropic-version: 2023-06-01

Body:
  model: "claude-sonnet-4-20250514"
  max_tokens: 4096
  system: SYSTEM_PROMPT_RAPPORT
  messages: [{ role: "user", content: userPrompt }]
```

#### Parsing de la réponse

1. Extraire `response.content[0].text`
2. Regex `/\{[\s\S]*\}/` pour extraire le JSON (Claude peut ajouter du texte autour)
3. `JSON.parse()` → `RapportContenu`

#### Audit des photos post-génération

Après la génération, le serveur vérifie que **toutes les photos envoyées** apparaissent dans le rapport :

1. Collecter toutes les `photo_url` des capture_items dans un Set
2. Parcourir les observations du rapport, collecter les `photos[].url` dans un autre Set
3. Comparer les deux sets
4. Si des photos manquent → créer une observation "Photos supplémentaires" avec les photos manquantes
5. Logger dans `generation_logs` (table optionnelle, graceful fail si absente)

#### Sauvegarde

- Upsert dans `rapports` (insert ou update si déjà existant)
- Update `chantiers.statut = 'rapport_genere'`

### 8.4 Export PDF

**Endpoint :** `POST /api/export-pdf`

**Bibliothèque :** jsPDF (côté serveur dans l'API route)

**Structure du PDF :**

```
Page 1+:
┌──────────────────────────────────────┐
│  ██████████████████████████████████  │ ← Header noir (32mm)
│  RAPPORT DE VISITE                   │   Titre blanc 18pt
│  Jean Dupont — 10 avril 2026         │   Sous-titre 10pt
├──────────────────────────────────────┤
│                                      │
│  INFORMATIONS CLIENT                 │ ← Heading vert 12pt
│  Nom : Jean Dupont                   │   Lignes label + valeur
│  Adresse : 12 rue des Lilas          │
│  ...                                 │
│                                      │
│  ────────────────────────────────    │ ← Séparateur gris
│                                      │
│  OBSERVATION 1 — Mur porteur         │ ← Heading vert 11pt bold
│  Description de l'observation...     │   Texte 9pt
│                                      │
│  ┌────────────────────────────────┐  │
│  │        [PHOTO]                 │  │ ← Photo centrée (85% largeur max)
│  └────────────────────────────────┘  │
│  Légende de la photo                 │   Italique 8pt gris
│                                      │
│  ┌─── Points de vigilance ────────┐  │ ← Encadré vert (#ECF7F5)
│  │  • Protection du parquet       │  │   9pt bold heading, 8pt body
│  │  • Étayer avant ouverture      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ACCÈS CHANTIER                      │ ← Si renseigné
│  Description...                      │
│                                      │
│  DURÉE ESTIMÉE                       │ ← Si renseignée
│  3 jours                             │
│                                      │
│  NOTES                               │ ← Si renseignées
│  ...                                 │
│                                      │
├──────────────────────────────────────┤
│  Rapport généré par IONNYX — AI      │ ← Footer 7pt gris centré
└──────────────────────────────────────┘
```

**Dimensions :**
- Format A4 : 210 × 297 mm
- Marges horizontales : 18mm de chaque côté → largeur contenu = 174mm
- Marge haute : 15mm
- Marge basse : 18mm
- Photos : max 85% de la largeur contenu, max ~100mm de hauteur

**Gestion des images :**
- Fetch de chaque photo via URL Supabase → ArrayBuffer → base64 → data URI
- Extraction des dimensions depuis les headers binaires JPEG/PNG
- PNG : octets 16-23 (width @ 16, height @ 20, big-endian)
- JPEG : marker SOF (0xFFC0-0xFFC3), height @ offset+5, width @ offset+7
- Fallback : 1920×1440 si parsing échoue

**Pagination automatique :**
- Fonction `checkPage(needed)` : si `y + needed > pageHeight - 18` → nouvelle page
- Footer réappliqué sur chaque page

**Nom du fichier :**
```
rapport-visite-{prenom}-{nom}-{YYYY-MM-DD}.pdf
```

### 8.5 Machine à états du chantier

```
planifie ──→ en_cours ──→ termine ──→ rapport_genere
   │                         │              │
   │                         │              ↓
   │                         │         (régénération = reste rapport_genere)
   │                         │
   │                         └──── (peut revenir en visite sans changer le statut)
   │
   └──── (suppression possible à tout moment)
```

| Transition | Déclencheur | Action |
|-----------|------------|--------|
| planifie → en_cours | Clic "Démarrer la visite" | Update statut + redirect vers `/visite` |
| en_cours → termine | Clic "Terminer" dans la visite | Update statut + redirect vers `/rapport` |
| termine → rapport_genere | Génération du rapport réussie | Update statut automatique par l'API |
| rapport_genere → rapport_genere | Régénération du rapport | Le rapport est écrasé (upsert) |

---

## 9. Intégrations externes

### 9.1 Supabase

| Service | Usage |
|---------|-------|
| **Auth** | Authentification email/password, gestion des sessions via cookies |
| **PostgreSQL** | 4 tables (chantiers, capture_items, rapports, profiles) avec RLS |
| **Storage** | 2 buckets : `photos` (public), `audio` (privé avec signed URLs) |

**URL projet :** `https://xuprrfhxwpkyhucgmqmg.supabase.co`

### 9.2 Anthropic Claude

| Paramètre | Valeur |
|-----------|--------|
| **Modèle** | claude-sonnet-4-20250514 |
| **Max tokens** | 4096 |
| **API version** | 2023-06-01 |
| **Endpoint** | https://api.anthropic.com/v1/messages |
| **Usage** | Génération de rapport structuré JSON à partir de captures terrain |

### 9.3 Groq Whisper

| Paramètre | Valeur |
|-----------|--------|
| **Modèle** | whisper-large-v3-turbo |
| **Langue** | fr (français) |
| **Format** | json |
| **Endpoint** | https://api.groq.com/openai/v1/audio/transcriptions |
| **Usage** | Transcription audio WebM/Opus → texte français |

### 9.4 API Adresse (gouvernement français)

| Paramètre | Valeur |
|-----------|--------|
| **Endpoint** | https://api-adresse.data.gouv.fr/search/ |
| **Paramètres** | `q={query}&limit=5` |
| **Usage** | Autocomplétion d'adresse dans le formulaire chantier |
| **Auth** | Aucune (API publique) |

### 9.5 Google Drive

| Paramètre | Valeur |
|-----------|--------|
| **API** | Google Drive API v3 |
| **Scope** | `https://www.googleapis.com/auth/drive.file` (fichiers créés par l'app seulement) |
| **Auth** | OAuth2 avec refresh token stocké dans `profiles` |
| **Dossier** | "Assistant de Visite - Compte-rendu" (créé automatiquement) |
| **Fichiers** | PDF du rapport, nommé `Rapport-{nom}-{prenom}-{DD-MM-YYYY}.pdf` |

**Flux OAuth Google Drive :**
1. L'utilisateur clique "Sauvegarder sur Drive" dans le rapport
2. Si pas de `google_refresh_token` → modal d'explication → redirect vers `/api/auth/google?chantierId={id}`
3. L'API génère une URL OAuth2 Google avec les scopes requis
4. L'utilisateur autorise l'accès sur la page Google
5. Callback → `/api/auth/google/callback` → échange code contre tokens → stockage dans `profiles`
6. Redirect vers `/chantiers/{id}/rapport?drive=connected`
7. Les appels suivants utilisent le refresh token stocké (auto-refresh si expiré)

---

## 10. Design system & CSS

### 10.1 Palette de couleurs

| Rôle | Couleur | Code |
|------|---------|------|
| Primary (CTA) | Émeraude | `#10B981` → `#059669` (gradient) |
| Header/Dark | Noir | `#1A1A1A` |
| Background | Gris clair | `#F8FAFC` |
| Foreground | Noir texte | `#111827` |
| Border | Gris | `#E5E7EB` |
| Input bg | Gris très clair | `#F9FAFB` |
| Input focus | Émeraude léger | `#ECFDF5` |
| Focus ring | Émeraude 15% | `rgba(16, 185, 129, 0.15)` |
| Error | Rouge | rouge standard Tailwind |

### 10.2 Badges de statut

| Statut | Couleur fond | Couleur texte | Icône |
|--------|-------------|---------------|-------|
| Planifié | emerald-50 | emerald-700 | 📅 |
| En cours | amber-50 | amber-700 | 🔨 |
| Terminé | gray-100 | gray-600 | ✓ |
| Rapport généré | emerald-50 | emerald-700 | 📄 |

### 10.3 Bande colorée des cartes (border-left-4)

| Statut | Couleur |
|--------|---------|
| Planifié | `border-emerald-500` |
| En cours | `border-amber-500` |
| Terminé | `border-gray-400` |
| Rapport | `border-emerald-500` |

### 10.4 Classes CSS custom

```css
.btn-primary    → gradient émeraude, ombre verte, scale 0.97 au clic
.btn-secondary  → fond noir, texte blanc
.btn-tertiary   → fond blanc, bordure grise, bordure émeraude au hover
.input-ionnyx   → fond gris clair, bordure émeraude au focus, halo vert
```

### 10.5 Animations

| Classe | Usage | Durée |
|--------|-------|-------|
| `animate-slide-up` | Modales bottom-sheet | 0.3s ease-out |
| `animate-scale-in` | Modales desktop | 0.28s ease-out |
| `animate-fade-in` | Toasts | 0.2s ease-out |
| `animate-card-appear` | Cartes dans le feed | 0.25s ease-out |
| `animate-bounce-check` | Checkmark de succès | 0.5s ease-out |
| `pulse-record` | Bouton enregistrement actif | Continu, scale 1 → 1.04 |
| `scrollbar-hide` | Onglets horizontaux | — |

### 10.6 Typographie

- **Police principale :** Inter (Google Fonts) avec fallback système
- **Tailles inputs :** 16px minimum (empêche le zoom iOS)
- **Rendu :** `-webkit-font-smoothing: antialiased`

---

## 11. PWA & mobile

### 11.1 Web App Manifest

```json
{
  "name": "Assistant de Visite",
  "short_name": "Visite",
  "start_url": "/chantiers",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#1A1A1A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

### 11.2 Optimisations mobile

- Inputs à 16px pour empêcher le zoom iOS
- Safe area insets pour les appareils à encoche
- Vibration haptic sur appui long (`navigator.vibrate(50)`)
- Clavier se ferme au scroll de la liste
- Compression d'image côté client pour les connexions 4G
- Boutons avec `touch-action` approprié
- Bottom sheets pour les menus contextuels

### 11.3 Pas de service worker

L'application n'a pas de service worker. Pas de mode offline. Le manifest permet l'ajout à l'écran d'accueil mais l'app nécessite une connexion internet.

---

## 12. Variables d'environnement

| Variable | Côté | Usage |
|----------|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Serveur | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Serveur | Clé publique Supabase (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur uniquement | Clé admin Supabase (bypass RLS) |
| `ANTHROPIC_API_KEY` | Serveur uniquement | Clé API Anthropic pour Claude |
| `GROQ_API_KEY` | Serveur uniquement | Clé API Groq pour Whisper |
| `GOOGLE_CLIENT_ID` | Serveur uniquement | OAuth2 Google - Client ID |
| `GOOGLE_CLIENT_SECRET` | Serveur uniquement | OAuth2 Google - Client Secret |
| `GOOGLE_REDIRECT_URI` | Serveur uniquement | OAuth2 Google - Callback URL |

---

## 13. Règles métier critiques

### Données

1. **Un utilisateur ne voit que ses propres chantiers** — RLS sur toutes les tables
2. **Un seul rapport par chantier** — contrainte UNIQUE sur `rapports.chantier_id`
3. **Suppression en cascade** — supprimer un chantier supprime ses capture_items, son rapport, ET ses fichiers storage
4. **Profil auto-créé** — trigger PostgreSQL crée une ligne `profiles` à chaque inscription

### Capture terrain

5. **Compression obligatoire** — toute photo est compressée à max 1920px / JPEG 80% avant upload
6. **Upload avec retry** — 3 tentatives avec backoff exponentiel (1s, 2s, 4s)
7. **Audio en signed URL** — les fichiers audio ont des URLs signées valables 1 an (bucket privé)
8. **Photos en URL publique** — les photos sont dans un bucket public (nécessaire pour l'analyse IA)
9. **Fenêtre de liaison photo-vocal** — 30 secondes depuis la photo OU countdown actif

### Rapport IA

10. **Aucune photo perdue** — audit post-génération ajoute les photos manquantes à "Photos supplémentaires"
11. **Liaisons explicites prioritaires** — `[LIÉ À PHOTO #X]` prime sur la proximité chronologique
12. **Mesures en gras** — toutes les dimensions dans `**...**` markdown
13. **Données client inchangées** — recopiées à l'identique dans le rapport
14. **Légendes spécifiques** — jamais de légende générique ("Vue du chantier" interdit)
15. **JSON strict** — Claude doit répondre uniquement en JSON, parsé par regex

### Export

16. **PDF généré côté serveur** — dans l'API route, pas côté client
17. **Images inline dans le PDF** — fetch + base64 + extraction dimensions binaires
18. **Dossier Drive auto-créé** — "Assistant de Visite - Compte-rendu" créé s'il n'existe pas
19. **Tokens Drive auto-refresh** — le refresh token est utilisé pour renouveler l'access token

---

*Fin du PRD — Document de référence pour la reconstruction du projet.*
