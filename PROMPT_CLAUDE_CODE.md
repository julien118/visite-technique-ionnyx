# PROMPT CLAUDE CODE — Assistant de Visite Terrain IONNYX

## Contexte

Tu vas développer une webapp complète appelée "Assistant de Visite Terrain" pour IONNYX, une agence d'automatisation IA spécialisée dans le secteur du bâtiment en France. Le PRD complet est fourni dans le fichier `PRD_Assistant_Visite_IONNYX.md`. Lis-le intégralement avant d'écrire la moindre ligne de code.

## Qui va utiliser cette app

Des artisans du bâtiment (maçons, plombiers, menuisiers, électriciens, maîtres d'œuvre). Ils ne sont PAS tech. Ils utilisent leur smartphone sur des chantiers, parfois avec des gants, parfois en plein soleil. L'app doit être aussi simple qu'un appareil photo + un dictaphone. Si un artisan de 55 ans ne comprend pas l'interface en 5 secondes, c'est raté.

## Stack technique imposée

- **Framework** : Next.js 14+ (App Router) avec TypeScript
- **Style** : Tailwind CSS
- **Base de données** : Supabase (PostgreSQL + Auth + Storage)
- **Transcription vocale** : Groq Whisper API (endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`, modèle: `whisper-large-v3-turbo`)
- **IA rapport** : OpenAI GPT-4.1 (endpoint: `https://api.openai.com/v1/chat/completions`, modèle: `gpt-4.1`)
- **Hébergement** : Vercel

## Variables d'environnement attendues

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
```

Ne hardcode JAMAIS de clé API. Utilise toujours les variables d'environnement.

## Structure du projet

```
/
├── app/
│   ├── layout.tsx                    # Layout principal
│   ├── page.tsx                      # Redirect vers /chantiers
│   ├── login/
│   │   └── page.tsx                  # Page de connexion
│   ├── chantiers/
│   │   ├── page.tsx                  # Écran 1 : Liste des chantiers
│   │   ├── nouveau/
│   │   │   └── page.tsx              # Écran 2 : Créer un chantier (fiche client)
│   │   └── [id]/
│   │       ├── page.tsx              # Écran 2 : Détail/édition fiche chantier
│   │       ├── visite/
│   │       │   └── page.tsx          # Écran 3 : Visite en cours (captation)
│   │       └── rapport/
│   │           └── page.tsx          # Écran 4 : Rapport généré
│   └── api/
│       ├── transcribe/
│       │   └── route.ts              # Proxy vers Groq Whisper
│       ├── generate-report/
│       │   └── route.ts              # Appel GPT-4.1 pour structurer le rapport
│       └── export-pdf/
│           └── route.ts              # Génération PDF du rapport
├── components/
│   ├── ui/                           # Composants UI réutilisables (Button, Card, Input, etc.)
│   ├── AudioRecorder.tsx             # Composant d'enregistrement vocal
│   ├── PhotoCapture.tsx              # Composant de prise de photo
│   ├── CaptureTimeline.tsx           # Le fil de captation (timeline)
│   ├── CaptureItem.tsx               # Un élément du fil (vocal ou photo)
│   ├── ChantierCard.tsx              # Carte chantier pour la liste
│   ├── ReportView.tsx                # Affichage du rapport structuré
│   └── StatusBadge.tsx               # Badge de statut (Planifié, En cours, etc.)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Client Supabase (browser)
│   │   ├── server.ts                 # Client Supabase (server-side)
│   │   └── middleware.ts             # Auth middleware
│   ├── groq.ts                       # Helper pour l'API Groq Whisper
│   ├── openai.ts                     # Helper pour l'API OpenAI
│   ├── types.ts                      # Types TypeScript (Chantier, CaptureItem, Rapport, etc.)
│   ├── utils.ts                      # Utilitaires (compression image, formatage dates, etc.)
│   └── prompts.ts                    # Prompts IA (structuration rapport)
├── public/
│   └── manifest.json                 # PWA manifest
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql    # Migration SQL initiale
```

## Instructions de développement

### Ordre de développement

Suis cet ordre EXACTEMENT. Ne passe pas à l'étape suivante tant que la précédente ne fonctionne pas.

**Étape 1 — Base de données**
- Crée le fichier de migration SQL avec toutes les tables (users via Supabase Auth, chantiers, capture_items, rapports)
- Ajoute les Row Level Security (RLS) policies pour que chaque utilisateur ne voie que ses propres données
- Crée les buckets Supabase Storage : `audio` (pour les vocaux) et `photos` (pour les photos)

**Étape 2 — Auth**
- Page de connexion simple (email + mot de passe)
- Pas d'inscription publique en V1 (les comptes sont créés manuellement dans Supabase)
- Middleware de protection des routes (redirect vers /login si non connecté)
- Session persistante

**Étape 3 — Liste des chantiers (Écran 1)**
- Affichage de tous les chantiers de l'utilisateur connecté
- Tri par date de visite décroissante
- Bouton "Nouvelle visite" bien visible
- Chaque carte est cliquable → redirige vers la fiche chantier

**Étape 4 — Fiche chantier (Écran 2)**
- Formulaire avec tous les champs décrits dans le PRD
- Sauvegarde automatique (debounce 1 seconde après chaque modification)
- Bouton "Démarrer la visite" (actif si au minimum le nom du client est rempli)
- Si la visite est déjà en cours ou terminée, le bouton change en "Reprendre la visite" ou "Voir le rapport"

**Étape 5 — Visite en cours / Captation (Écran 3) — LE PLUS IMPORTANT**
- Le fil de captation (timeline verticale) avec les éléments empilés chronologiquement
- Le bouton micro :
  - Utilise l'API MediaRecorder pour enregistrer l'audio
  - Format : webm/opus (natif du navigateur, léger)
  - Feedback visuel clair pendant l'enregistrement (bouton rouge + animation pulse)
  - À l'arrêt : upload du fichier audio vers Supabase Storage
  - Appel API `/api/transcribe` qui forward vers Groq Whisper
  - Affichage de "Transcription en cours…" pendant le traitement
  - Affichage du texte transcrit dans le fil
  - Possibilité de corriger le texte (clic sur le texte → mode édition inline)
- Le bouton photo :
  - Utilise `<input type="file" accept="image/*" capture="environment">` pour ouvrir la caméra native
  - Compression côté client AVANT upload (utilise canvas pour redimensionner à max 1920px de large, qualité JPEG 0.8)
  - Upload vers Supabase Storage bucket "photos"
  - Miniature dans le fil
- Suppression d'un élément : bouton discret sur chaque bloc, confirmation avant suppression
- Header fixe avec nom du client + compteur d'éléments
- Barre d'action fixe en bas avec les 2 boutons (micro + photo)

**Étape 6 — Génération du rapport (Écran 4)**
- Bouton "Terminer la visite" → écran de confirmation avec compteur
- Appel API `/api/generate-report` qui :
  1. Récupère tous les capture_items ordonnés par position
  2. Construit le prompt avec les infos client + le flux chronologique
  3. Envoie à GPT-4.1
  4. Parse le JSON retourné
  5. Sauvegarde dans la table rapports
- Affichage du rapport structuré avec photos intégrées
- Bouton "Télécharger en PDF"
- Bouton "Régénérer" si le rapport ne convient pas
- Bouton "Modifier" pour édition inline du texte du rapport

### Règles de code

1. **TypeScript strict** — Pas de `any`. Définis des types pour tout (Chantier, CaptureItem, Rapport, etc.) dans `lib/types.ts`.

2. **Composants simples** — Un composant = une responsabilité. Pas de composants de 500 lignes. Découpe.

3. **Gestion d'erreurs** — Chaque appel API, chaque interaction Supabase, chaque appel IA doit avoir un try/catch avec un message d'erreur clair affiché à l'utilisateur. Pas de crash silencieux.

4. **Loading states** — Chaque action asynchrone doit avoir un état de chargement visible (spinner, skeleton, texte "En cours…"). L'utilisateur ne doit JAMAIS se demander "est-ce que ça marche ?"

5. **Mobile-first** — Le CSS est pensé pour un écran de 375px de large en priorité. Les breakpoints desktop sont un bonus.

6. **Boutons tactiles** — Minimum 48px de hauteur pour tous les boutons interactifs. Les boutons principaux (micro, photo, nouvelle visite) font 64px minimum.

7. **Pas de librairie UI lourde** — Pas de Material UI, Chakra, etc. Tailwind CSS suffit. On veut un bundle léger et rapide.

8. **Commentaires en français** — Les commentaires dans le code sont en français (l'utilisateur final est français, le développeur aussi).

9. **Nommage** — Variables et fonctions en anglais (convention JS/TS standard), commentaires en français, textes affichés à l'utilisateur en français.

### API Route — Transcription vocale (`/api/transcribe`)

```typescript
// L'audio arrive en FormData avec le fichier
// On forward vers Groq Whisper
// Réponse : { text: "transcription..." }

const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'whisper-large-v3-turbo');
formData.append('language', 'fr');
formData.append('response_format', 'json');

const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
  },
  body: formData,
});
```

### API Route — Génération du rapport (`/api/generate-report`)

Le prompt IA complet est dans le PRD (section 6). Utilise-le tel quel. Le format de sortie attendu est le JSON décrit dans la section 4.3 du PRD.

Envoie les photos sous forme d'URLs publiques (Supabase Storage URLs). L'IA n'analyse PAS les photos visuellement — elle utilise uniquement la position chronologique et le contexte sémantique des vocaux pour corréler photos et observations.

### Compression des photos côté client

```typescript
// Utilise canvas pour compresser avant upload
async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}
```

### PWA

Ajoute un `manifest.json` minimal pour que l'app soit installable sur l'écran d'accueil :

```json
{
  "name": "Assistant de Visite",
  "short_name": "Visite",
  "start_url": "/chantiers",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1E3A5F",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Ce qui est HORS SCOPE pour cette V1

NE développe PAS ces fonctionnalités :
- Mode hors-ligne
- Export Google Drive
- Multi-utilisateur / gestion d'équipe
- Intégration Constructeur ou tout autre logiciel de devis
- Génération de pré-devis
- Inscription publique (les comptes sont créés manuellement)
- Notifications push
- Partage de rapport par lien

## Critère de succès

Le projet est réussi quand :
1. Je peux me connecter avec un email/mot de passe
2. Je peux créer un nouveau chantier avec les infos client
3. Je peux démarrer une visite et alterner librement entre vocaux et photos
4. Les vocaux sont transcrits en moins de 10 secondes
5. Les photos sont compressées et uploadées rapidement
6. Je peux terminer la visite et générer un rapport structuré
7. Le rapport montre chaque observation avec ses photos correctement corrélées
8. Je peux télécharger le rapport en PDF
9. Tout fonctionne sur un iPhone ou Android en mode portrait
10. L'interface est simple, lisible, et utilisable avec des gros doigts

## Commence maintenant

Commence par l'étape 1 (migration SQL + setup Supabase), puis passe à l'étape 2 (auth), et ainsi de suite. Montre-moi le code étape par étape. Si tu as une question ou un doute sur un choix technique, pose la question AVANT de coder.
