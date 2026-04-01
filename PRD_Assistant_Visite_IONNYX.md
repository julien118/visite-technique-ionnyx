# PRD — Assistant de Visite Terrain IONNYX

## Document de référence pour le développement

- **Produit** : Assistant de Visite Terrain (webapp mobile-first)
- **Auteur** : Julien Guedet — IONNYX
- **Version** : 1.0
- **Date** : 26 mars 2026
- **Cible** : Artisans du bâtiment (maçons, MOE, plombiers, menuisiers, peintres, carreleurs, électriciens…)
- **Maître mot** : **SIMPLICITÉ**

---

## 1. Contexte et problème

### 1.1 Le workflow actuel des artisans

Chaque visite de chantier suit 3 phases naturelles :

**Phase 1 — Avant la visite (au bureau ou au téléphone)**
L'artisan prend rendez-vous avec le client. Il note les coordonnées (nom, prénom, adresse, téléphone, mail), l'objet général des travaux, la provenance du contact, et la date de visite. Ces informations forment son "dossier d'études". Quand il arrive chez le client, il sait déjà globalement ce qu'il vient faire.

**Phase 2 — Sur le chantier, le tour avec le client**
L'artisan ne sort ni téléphone ni calepin. Il fait le tour du chantier avec le client : il discute, écoute les besoins, donne des conseils, regarde l'environnement, prend quelques mesures au mètre. C'est la phase humaine et commerciale. Il découvre aussi les travaux supplémentaires non mentionnés au téléphone.

**Phase 3 — Sur le chantier, la prise de notes**
Une fois le tour terminé, l'artisan reprend le parcours (seul ou avec le client à côté). Il note tout : mesures, observations, contraintes, photos. Aujourd'hui, c'est fait au calepin + photos sur le téléphone, de manière déconnectée.

### 1.2 Les problèmes identifiés (retours terrain)

1. **Photos déconnectées des observations** — Problème n°1. L'artisan prend 15-20 photos d'un chantier. Quand il rentre au bureau, il ne sait plus quelle photo correspond à quelle observation. Surtout quand il y a 3 fenêtres similaires sur la même façade nécessitant chacune un travail différent.

2. **Le calepin est archaïque** — Tous les artisans utilisent encore un calepin papier. Ils photographient, écrivent, photographient, écrivent. C'est la norme universelle du secteur en 2026.

3. **Perte d'information entre le chantier et le bureau** — L'artisan voit 2-3 chantiers par jour, fait de la route, vit sa vie. Quand il se pose le soir pour faire ses devis, il a oublié des détails. Il doit "se réimprégner" et il manque toujours quelque chose. Parfois, il doit retourner sur le chantier pour une mesure oubliée.

4. **Plusieurs tâches par chantier** — C'est quasi systématique. Un chantier = plusieurs interventions distinctes (ouvrir un mur porteur + boucher une fenêtre + réparer une marche). Tout doit être clairement séparé dans le rapport mais sans imposer une structure rigide pendant la captation.

5. **Le temps réel compte** — Pour les petites structures (2 personnes), si le rapport part sur le Drive immédiatement après la visite, la personne au bureau peut commencer à travailler (plans, devis) sans attendre le retour de l'artisan.

6. **Les solutions existantes ne conviennent pas** — Les logiciels existants (Constructeur, Renalto…) gèrent les devis mais pas la visite technique. Les applis qui essaient de s'y mettre sont "trop génériques" et "pas dans l'âme de l'artisan" (citation directe du client).

### 1.3 La vision produit

Remplacer le calepin + les photos en vrac par un assistant numérique ultra simple. L'artisan parle et photographie librement, comme s'il avait un dictaphone intelligent. L'IA structure tout automatiquement en un rapport clair où chaque observation est corrélée à ses photos. Quand l'artisan ouvre le rapport au bureau, il se réimprègne instantanément de toute sa visite.

---

## 2. Utilisateur cible

### 2.1 Persona principal

- **Nom** : "Hendrix" (client réel, maçon, entreprise MTC37)
- **Profil** : Artisan du bâtiment, 1-10 salariés, basé en Centre-Val de Loire
- **Métiers concernés** : Maçon, maître d'œuvre, plombier, menuisier, peintre, carreleur, électricien, couvreur, plaquiste
- **Contexte d'usage** : Sur le chantier (debout, parfois en extérieur, parfois avec le client à côté), puis au bureau (2 écrans, rédaction de devis)
- **Compétence tech** : Utilise WhatsApp, Google Drive, un logiciel de devis (Constructeur). Pas développeur. A besoin que "ça marche tout seul".
- **Frustration principale** : "Quand je rentre au bureau, j'ai mes photos d'un côté et mes notes de l'autre, et je ne sais plus ce qui va avec quoi."

### 2.2 Cas d'usage secondaire

- **Fred (MOE)** : Maître d'œuvre, travaille avec sa femme (architecte) au bureau. Il prend des notes au calepin (4 pages sur un seul chantier). Sa femme a besoin des infos en temps réel pour commencer les plans sans attendre son retour.

---

## 3. Spécifications fonctionnelles

### 3.1 Architecture globale

Webapp mobile-first (responsive, utilisable sur smartphone en mode portrait). Pas une app native : une PWA ou webapp classique accessible via un navigateur mobile. L'artisan la met en favori sur son écran d'accueil.

4 écrans principaux :
1. **Liste des chantiers** (dashboard)
2. **Fiche chantier** (infos client)
3. **Visite en cours** (captation terrain — cœur du produit)
4. **Rapport généré** (visualisation du compte-rendu)

### 3.2 Écran 1 — Liste des chantiers

**Objectif** : Voir toutes ses visites d'un coup d'œil, en créer une nouvelle.

**Éléments affichés par chantier** :
- Nom du client
- Adresse du chantier
- Date de la visite
- Statut : `Planifié` / `En cours` / `Terminé` / `Rapport généré`

**Actions** :
- Bouton principal "Nouvelle visite" (toujours visible, en haut ou en bas de l'écran, gros et évident)
- Cliquer sur un chantier existant → ouvre la fiche chantier
- Filtre simple par statut (optionnel V1, pas prioritaire)
- Recherche par nom de client (optionnel V1)

**Tri par défaut** : Date de visite décroissante (le plus récent en haut).

**Design** :
- Cartes simples, une par chantier
- Pas de tableau, pas de complexité
- Grand bouton d'action, facile à toucher avec un pouce (gants de chantier, doigts épais)

### 3.3 Écran 2 — Fiche chantier (infos client)

**Objectif** : Renseigner les informations du client et du chantier. Remplissable AVANT la visite (au bureau) ou SUR PLACE (sur le chantier).

**Champs** :

| Champ | Type | Obligatoire | Notes |
|-------|------|-------------|-------|
| Prénom client | Texte | Oui | — |
| Nom client | Texte | Oui | — |
| Adresse du chantier | Texte | Oui | Adresse complète |
| Téléphone client | Téléphone | Non | Format FR |
| Email client | Email | Non | — |
| Date de la visite | Date + heure | Oui | Pré-rempli avec date/heure actuelle |
| Objet des travaux | Texte libre (multiligne) | Non | Ex: "Ouverture mur porteur + fenêtre à boucher" |
| Provenance | Texte libre | Non | Ex: "BNI", "Direct client", "Recommandation Fred" |
| Type de chantier | Sélecteur | Non | Direct client / Sous-traitance |

**Comportement** :
- Tous les champs sont des inputs simples. PAS de chatbot, PAS de questions posées par l'IA, PAS de conversation. Juste des champs à remplir.
- L'artisan peut remplir ce qu'il veut, quand il veut. S'il n'a que le nom et l'adresse, c'est suffisant pour démarrer la visite.
- Bouton "Démarrer la visite" en bas de l'écran (actif dès qu'au minimum le nom du client est renseigné)
- Les infos sont sauvegardées automatiquement (pas de bouton "sauvegarder")
- Possibilité de revenir éditer les infos à tout moment (même après la visite)

**Design** :
- Formulaire simple, scroll vertical
- Labels clairs au-dessus de chaque champ
- Gros bouton "Démarrer la visite" en bas, fixe, bien visible

### 3.4 Écran 3 — Visite en cours (cœur du produit)

**Objectif** : Permettre à l'artisan de capturer toutes ses observations et photos de manière fluide, libre, sans structure imposée. Comme un dictaphone intelligent couplé à un appareil photo.

#### 3.4.1 Philosophie UX

L'artisan ne structure RIEN. Il parle, il photographie, dans l'ordre qu'il veut, au rythme qu'il veut. Le système capture tout chronologiquement.

L'interface ressemble à un "fil" ou "timeline" verticale qui s'empile de haut en bas. Chaque élément capturé (vocal transcrit ou photo) apparaît dans le fil, dans l'ordre chronologique.

**C'est l'IA qui structurera le rapport à la fin — pas l'artisan pendant la captation.**

#### 3.4.2 Éléments d'interface

**Zone principale** : Le fil de captation (scroll vertical). Chaque entrée est un bloc :
- **Bloc vocal** : Icône micro + texte transcrit + horodatage. L'artisan voit la transcription apparaître pour vérifier que c'est bien compris.
- **Bloc photo** : Miniature de la photo + horodatage. Cliquer dessus → vue plein écran.

**Barre d'action fixe en bas de l'écran** (toujours visible, même en scrollant) :
- **Bouton micro** (gros, à gauche) : Appui = début d'enregistrement. Re-appui = fin d'enregistrement. L'enregistrement vocal est envoyé pour transcription IA. La transcription apparaît dans le fil en quelques secondes.
- **Bouton appareil photo** (gros, à droite) : Ouvre l'appareil photo natif du téléphone. La photo prise est ajoutée au fil.
- Espace entre les deux boutons suffisant pour éviter les erreurs tactiles

**Header fixe en haut** :
- Nom du client + adresse (rappel du chantier en cours)
- Bouton "Terminer la visite" (discret mais accessible, coin supérieur droit)
- Compteur d'éléments captés (ex: "12 éléments — 5 photos, 7 vocaux")

#### 3.4.3 Comportement du bouton micro (vocal)

1. L'artisan appuie sur le bouton micro
2. Indicateur visuel clair : le bouton change de couleur (rouge), une animation pulse, le texte "Enregistrement…" apparaît
3. L'artisan parle librement, aussi longtemps qu'il veut
4. Il appuie à nouveau pour arrêter
5. Le système envoie l'audio pour transcription (Groq Whisper ou OpenAI Whisper)
6. Pendant la transcription : indicateur de chargement dans le fil ("Transcription en cours…")
7. La transcription apparaît dans le fil sous forme de texte
8. L'artisan peut corriger le texte transcrit en tapant dessus (édition inline)

**Contraintes** :
- La transcription doit être rapide (< 5 secondes idéalement, < 10 secondes max)
- Doit gérer le vocabulaire BTP (parpaing, mur porteur, IPN, HEB, plancher béton, enduit, ravalement, placo, etc.)
- Doit gérer les noms de rues, villes, etc.
- Doit gérer les mesures (mètres, cm, m², etc.)

#### 3.4.4 Comportement du bouton photo

1. L'artisan appuie sur le bouton photo
2. L'appareil photo natif du téléphone s'ouvre (via `<input type="file" accept="image/*" capture="environment">` ou API MediaDevices)
3. L'artisan prend la photo
4. La photo apparaît dans le fil (miniature)
5. Possibilité de prendre plusieurs photos d'affilée (chaque photo = un bloc dans le fil)

**Contraintes** :
- Les photos doivent être compressées côté client avant upload (max 1-2 Mo par photo) pour ne pas saturer la connexion terrain (4G variable sur les chantiers)
- Format JPEG
- Conserver les métadonnées EXIF (orientation, date/heure, GPS si disponible)

#### 3.4.5 Possibilité de supprimer un élément

L'artisan peut supprimer un bloc du fil (vocal ou photo) par un swipe gauche ou un bouton "supprimer" discret sur chaque bloc. Confirmation avant suppression.

#### 3.4.6 Fonctionnement hors-ligne (V2 — important mais pas V1)

En V2, l'application devrait fonctionner en mode hors-ligne :
- Enregistrement vocal stocké en local
- Photos stockées en local
- Transcription mise en file d'attente
- Synchronisation automatique quand la connexion revient

Pour la V1, une connexion internet est requise (4G/WiFi).

### 3.5 Écran 4 — Génération du rapport

#### 3.5.1 Déclenchement

L'artisan appuie sur "Terminer la visite". Un écran de confirmation apparaît :
- Résumé : "Vous avez capté X photos et Y observations vocales"
- Bouton "Générer le rapport"
- Bouton "Revenir à la visite" (si oubli)

#### 3.5.2 Processus de génération (IA)

Le système envoie à l'IA (GPT-4.1 ou équivalent) :
- Toutes les transcriptions vocales dans l'ordre chronologique
- Toutes les photos avec leur position dans le fil (avant/après quelles observations)
- Les infos client de la fiche chantier

**Prompt IA — Instructions de structuration** :

L'IA doit :
1. Analyser le flux chronologique (vocaux + positions des photos)
2. Identifier les différentes tâches/interventions décrites par l'artisan
3. Corréler chaque photo aux observations qui l'entourent dans le fil (la photo est rattachée aux observations vocales les plus proches chronologiquement, en particulier celles qui la précèdent immédiatement)
4. Structurer un rapport clair et professionnel avec :
   - En-tête : infos client complètes (nom, adresse, téléphone, mail, date de visite, provenance, type de chantier)
   - Pour chaque tâche identifiée : un titre clair, les observations détaillées reformulées proprement, les photos associées, les points de vigilance mentionnés par l'artisan
   - Section "Accès chantier" si l'artisan a mentionné des infos d'accès
   - Durée estimée des travaux si mentionnée
   - Notes complémentaires si pertinent

**Règle critique pour la corrélation photo-observation** :
- Si l'artisan fait un vocal puis prend une photo, la photo illustre ce qu'il vient de décrire
- Si l'artisan prend une photo puis fait un vocal, le vocal décrit ce qu'il vient de photographier
- Si l'artisan prend plusieurs photos d'affilée entre deux vocaux, toutes ces photos sont rattachées au vocal le plus proche (avant ou après selon le contexte sémantique)
- L'IA doit utiliser le contenu sémantique des vocaux pour affiner la corrélation (ex: "là, la fenêtre…" + photo d'une fenêtre = match évident)

#### 3.5.3 Affichage du rapport

Le rapport est affiché directement dans l'application, dans un format lisible et professionnel.

**Structure du rapport affiché** :

```
╔══════════════════════════════════════╗
║  RAPPORT DE VISITE                   ║
║  [Nom client] — [Date]              ║
╠══════════════════════════════════════╣
║                                      ║
║  INFORMATIONS CLIENT                 ║
║  Nom : ...                           ║
║  Adresse : ...                       ║
║  Téléphone : ...                     ║
║  Email : ...                         ║
║  Provenance : ...                    ║
║  Type : Direct / Sous-traitance      ║
║                                      ║
╠══════════════════════════════════════╣
║                                      ║
║  OBSERVATION 1 — [Titre auto]        ║
║  [Texte structuré de l'observation]  ║
║  📷 [Photo 1] [Photo 2]             ║
║  ⚠️ Points de vigilance : ...       ║
║                                      ║
╠──────────────────────────────────────╣
║                                      ║
║  OBSERVATION 2 — [Titre auto]        ║
║  [Texte structuré de l'observation]  ║
║  📷 [Photo 3]                        ║
║  ⚠️ Points de vigilance : ...       ║
║                                      ║
╠══════════════════════════════════════╣
║                                      ║
║  ACCÈS CHANTIER                      ║
║  [Infos d'accès si mentionnées]      ║
║                                      ║
║  DURÉE ESTIMÉE                       ║
║  [Durée si mentionnée]               ║
║                                      ║
╚══════════════════════════════════════╝
```

**Actions après génération** :
- Bouton "Envoyer sur Google Drive" → Le rapport (avec les photos intégrées) est envoyé sur le Google Drive de l'artisan dans un dossier dédié
- Bouton "Télécharger en PDF" → Téléchargement local du rapport
- Bouton "Modifier le rapport" → L'artisan peut corriger le texte directement dans le rapport avant export (édition inline)
- Bouton "Régénérer" → Si le rapport ne convient pas, relancer l'IA avec les mêmes données

---

## 4. Spécifications techniques

### 4.1 Stack recommandée

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Frontend | Next.js (React) + Tailwind CSS | SSR pour la performance, Tailwind pour le design rapide, PWA-ready |
| Backend | Next.js API Routes ou FastAPI (Python) | Simplicité, tout-en-un avec Next.js |
| Base de données | Supabase (PostgreSQL) | Auth intégrée, stockage fichiers, real-time, Julien connaît déjà |
| Stockage photos | Supabase Storage | Intégré, pas de service tiers |
| Transcription vocale | Groq Whisper API | Ultra rapide, Julien l'utilise déjà dans ses workflows n8n |
| IA structuration rapport | OpenAI GPT-4.1 | Capacité de raisonnement pour la corrélation photo-observation |
| Google Drive | Google Drive API | Export du rapport sur le Drive de l'artisan |
| Hébergement | Vercel (frontend) + Supabase (backend) | Déploiement simple, gratuit au démarrage |
| Auth | Supabase Auth | Email/password, simple |

### 4.2 Modèle de données

```
┌─────────────────┐
│     users        │
├─────────────────┤
│ id (uuid, PK)   │
│ email            │
│ name             │
│ company_name     │
│ created_at       │
└────────┬────────┘
         │ 1
         │
         │ N
┌────────▼────────┐
│    chantiers     │
├─────────────────┤
│ id (uuid, PK)   │
│ user_id (FK)     │
│ client_prenom    │
│ client_nom       │
│ client_adresse   │
│ client_telephone │
│ client_email     │
│ date_visite      │
│ objet_travaux    │
│ provenance       │
│ type_chantier    │  ← "direct" | "sous_traitance"
│ statut           │  ← "planifie" | "en_cours" | "termine" | "rapport_genere"
│ created_at       │
│ updated_at       │
└────────┬────────┘
         │ 1
         │
         │ N
┌────────▼────────┐
│  capture_items   │
├─────────────────┤
│ id (uuid, PK)   │
│ chantier_id (FK) │
│ type             │  ← "vocal" | "photo"
│ position (int)   │  ← Ordre chronologique dans le fil
│ audio_url        │  ← URL du fichier audio (si vocal)
│ transcription    │  ← Texte transcrit (si vocal)
│ photo_url        │  ← URL de la photo (si photo)
│ created_at       │
└─────────────────┘

┌─────────────────┐
│    rapports      │
├─────────────────┤
│ id (uuid, PK)   │
│ chantier_id (FK) │
│ contenu_json     │  ← Rapport structuré (JSON) généré par l'IA
│ contenu_html     │  ← Rapport mis en forme (HTML) pour affichage/export
│ drive_url        │  ← URL Google Drive si exporté
│ pdf_url          │  ← URL du PDF si généré
│ created_at       │
│ updated_at       │
└─────────────────┘
```

### 4.3 Format du rapport structuré (contenu_json)

```json
{
  "client": {
    "prenom": "Jean-Michel",
    "nom": "Tournoi",
    "adresse": "34 rue Baptiste Marcet, 37000 Tours",
    "telephone": "06 XX XX XX XX",
    "email": "jm.tournoi@sopeg.fr",
    "date_visite": "2026-03-26T14:30:00",
    "provenance": "Direct client — ami",
    "type_chantier": "direct"
  },
  "observations": [
    {
      "titre": "Ouverture mur porteur — Façade rue Baptiste Marcet",
      "description": "Ouverture d'un mur porteur d'une longueur de 5,36 m et d'une hauteur de 2,97 m. Mur en parpaing de 20. Façade donnant sur la rue Baptiste Marcet.",
      "points_vigilance": [
        "Appartement situé devant la façade — attention lors des travaux",
        "Prévoir un Manitou pour la mise en place de la poutre pré-contrainte en béton armé",
        "Protection du sol obligatoire",
        "Dépose de la menuiserie existante — dépôt sur place pour le client",
        "Prévoir un mini-pelle",
        "Évacuation des gravats à prévoir"
      ],
      "photos": [
        {
          "url": "https://...",
          "legende": "Vue de la façade — mur porteur à ouvrir"
        }
      ]
    }
  ],
  "acces_chantier": "Accès par la rue Baptiste Marcet, possibilité d'amener un Manitou",
  "duree_estimee": "1 semaine",
  "notes": ""
}
```

### 4.4 API Endpoints

```
POST   /api/auth/login             → Connexion
POST   /api/auth/register          → Inscription

GET    /api/chantiers              → Liste des chantiers de l'utilisateur
POST   /api/chantiers              → Créer un nouveau chantier
GET    /api/chantiers/:id          → Détail d'un chantier
PUT    /api/chantiers/:id          → Mettre à jour les infos chantier
DELETE /api/chantiers/:id          → Supprimer un chantier

POST   /api/chantiers/:id/capture/vocal    → Upload audio + transcription
POST   /api/chantiers/:id/capture/photo    → Upload photo
GET    /api/chantiers/:id/capture          → Liste des éléments captés (fil)
DELETE /api/capture/:id                     → Supprimer un élément du fil

POST   /api/chantiers/:id/rapport/generer  → Déclencher la génération IA
GET    /api/chantiers/:id/rapport          → Récupérer le rapport
PUT    /api/chantiers/:id/rapport          → Modifier le rapport manuellement
POST   /api/chantiers/:id/rapport/drive    → Exporter sur Google Drive
GET    /api/chantiers/:id/rapport/pdf      → Télécharger en PDF
```

### 4.5 Flux technique — Captation vocale

```
[Artisan appuie sur micro]
        │
        ▼
[Enregistrement audio via MediaRecorder API]
        │
        ▼
[Artisan arrête l'enregistrement]
        │
        ▼
[Compression audio côté client (format webm/opus ou mp3)]
        │
        ▼
[Upload vers Supabase Storage]
        │
        ▼
[Appel API Groq Whisper — transcription]
        │
        ▼
[Réception transcription texte]
        │
        ▼
[Sauvegarde capture_item (audio_url + transcription)]
        │
        ▼
[Affichage dans le fil avec le texte transcrit]
```

### 4.6 Flux technique — Génération du rapport

```
[Artisan appuie sur "Terminer la visite"]
        │
        ▼
[Récupération de tous les capture_items du chantier (ordonnés par position)]
        │
        ▼
[Construction du prompt IA avec :]
  - Infos client (fiche chantier)
  - Liste chronologique des éléments :
    "VOCAL #1 (position 1) : [transcription]"
    "PHOTO #2 (position 2) : [photo_url]"
    "VOCAL #3 (position 3) : [transcription]"
    "PHOTO #4 (position 4) : [photo_url]"
    "PHOTO #5 (position 5) : [photo_url]"
    "VOCAL #6 (position 6) : [transcription]"
        │
        ▼
[Appel OpenAI GPT-4.1 avec prompt de structuration]
  → Instructions : analyser le flux, identifier les tâches,
    corréler photos et observations, structurer le rapport
        │
        ▼
[Réception du JSON structuré]
        │
        ▼
[Génération du HTML de rendu à partir du JSON]
        │
        ▼
[Sauvegarde dans table rapports]
        │
        ▼
[Affichage du rapport dans l'app]
```

---

## 5. Design et UX

### 5.1 Principes directeurs

1. **Utilisable avec des gants** — Boutons larges (minimum 48px, idéalement 64px pour les boutons principaux), espacement généreux
2. **Lisible en plein soleil** — Contraste fort, texte sombre sur fond clair, pas de couleurs pastel
3. **Zéro apprentissage** — L'artisan doit comprendre quoi faire en 2 secondes sans explication
4. **Mobile-first strict** — Conçu pour un smartphone tenu à une main en portrait. Desktop = bonus (pour le rapport au bureau sur 2 écrans)
5. **Feedback immédiat** — Chaque action donne un retour visuel clair (enregistrement en cours = rouge qui pulse, photo prise = miniature qui apparaît, transcription en cours = loader)
6. **Pas de jargon tech** — Pas de "workflow", "pipeline", "sync". Des mots simples : "Nouvelle visite", "Parler", "Photo", "Générer le rapport"

### 5.2 Palette de couleurs

| Élément | Couleur | Usage |
|---------|---------|-------|
| Primaire | Bleu BTP (#1E3A5F ou similaire) | Header, boutons principaux |
| Action | Orange vif (#F97316) | CTA "Nouvelle visite", "Générer le rapport" |
| Enregistrement | Rouge (#EF4444) | Bouton micro actif, indicateur d'enregistrement |
| Fond | Blanc (#FFFFFF) | Background principal |
| Texte | Noir/gris foncé (#1F2937) | Texte courant |
| Succès | Vert (#22C55E) | Confirmations, statut "Rapport généré" |
| Bordures | Gris clair (#E5E7EB) | Séparateurs, cartes |

### 5.3 Wireframes textuels

#### Écran 1 — Liste des chantiers

```
┌──────────────────────────────┐
│  🏗️ Mes Chantiers            │
├──────────────────────────────┤
│                              │
│  ┌──────────────────────┐    │
│  │ Jean-Michel Tournoi   │    │
│  │ 34 rue B. Marcet     │    │
│  │ 26/03/2026           │    │
│  │ 🟢 Rapport généré     │    │
│  └──────────────────────┘    │
│                              │
│  ┌──────────────────────┐    │
│  │ Xavier Briggs         │    │
│  │ 15 av. du Danemark   │    │
│  │ 27/03/2026           │    │
│  │ 🟡 Planifié           │    │
│  └──────────────────────┘    │
│                              │
│  ┌──────────────────────┐    │
│  │ ICF Atlantique        │    │
│  │ St-Pierre-des-Corps  │    │
│  │ 28/03/2026           │    │
│  │ 🔵 En cours           │    │
│  └──────────────────────┘    │
│                              │
│  ╔══════════════════════╗    │
│  ║  + Nouvelle visite   ║    │
│  ╚══════════════════════╝    │
│                              │
└──────────────────────────────┘
```

#### Écran 3 — Visite en cours

```
┌──────────────────────────────┐
│ Jean-Michel Tournoi          │
│ 34 rue Baptiste Marcet      │
│ 📊 8 éléments     [Terminer]│
├──────────────────────────────┤
│                              │
│  🎤 14:32                    │
│  "Il s'agit d'ouvrir un     │
│   mur porteur d'une longueur│
│   de 5,36 m et d'une hauteur│
│   de 2,97 m. C'est un mur   │
│   en parpaing de 20..."     │
│                              │
│  📷 14:33                    │
│  ┌────────────────────┐      │
│  │                    │      │
│  │   [Photo façade]   │      │
│  │                    │      │
│  └────────────────────┘      │
│                              │
│  📷 14:33                    │
│  ┌────────────────────┐      │
│  │                    │      │
│  │   [Photo sol]      │      │
│  │                    │      │
│  └────────────────────┘      │
│                              │
│  🎤 14:35                    │
│  "Deuxième sujet : il y a   │
│   une fenêtre à boucher en  │
│   parpaing. Accès par le    │
│   jardin, c'est facile..."  │
│                              │
│  📷 14:35                    │
│  ┌────────────────────┐      │
│  │                    │      │
│  │  [Photo fenêtre]   │      │
│  │                    │      │
│  └────────────────────┘      │
│                              │
│  🎤 14:37  ⏳ Transcription…│
│                              │
├──────────────────────────────┤
│                              │
│  ╔════════╗    ╔════════╗    │
│  ║  🎤    ║    ║  📷    ║    │
│  ║ Parler ║    ║ Photo  ║    │
│  ╚════════╝    ╚════════╝    │
│                              │
└──────────────────────────────┘
```

---

## 6. Prompt IA — Génération du rapport

Ce prompt est envoyé à GPT-4.1 pour structurer le rapport à partir du flux brut.

```
SYSTEM PROMPT :

Tu es un assistant spécialisé dans la structuration de rapports de visite de chantier pour des artisans du bâtiment.

Tu reçois :
1. Les informations client (fiche chantier)
2. Un flux chronologique d'éléments captés pendant la visite : des transcriptions vocales et des photos, dans l'ordre où l'artisan les a produits.

Ta mission :
- Analyser le flux pour identifier les différentes tâches/interventions décrites
- Corréler chaque photo aux observations les plus pertinentes (une photo est généralement liée au vocal qui la précède immédiatement ou qui la suit immédiatement)
- Produire un rapport structuré en JSON

Règles de corrélation photo-observation :
- VOCAL puis PHOTO(s) → les photos illustrent l'observation vocale
- PHOTO(s) puis VOCAL → le vocal décrit ce qui a été photographié
- Plusieurs PHOTOS entre deux VOCAUX → rattacher au vocal sémantiquement le plus pertinent
- Utiliser le contenu sémantique pour affiner (ex: le vocal mentionne "fenêtre" + la photo montre une fenêtre = corrélation forte)

Règles de rédaction :
- Reformuler les observations de manière professionnelle et structurée, sans perdre les détails techniques
- Conserver toutes les mesures exactes mentionnées
- Identifier et lister les points de vigilance (protection, accès, matériel spécifique nécessaire)
- Générer un titre descriptif pour chaque tâche/observation
- Regrouper les informations d'accès chantier si mentionnées
- Extraire la durée estimée si mentionnée

Format de sortie : JSON strict, conforme au schéma fourni. Ne rien ajouter en dehors du JSON.
```

---

## 7. Roadmap

### V1 — MVP (objectif : 2-3 semaines)

Tout ce qui est décrit dans ce PRD, à l'exception de :
- Mode hors-ligne
- Intégration Google Drive (en V1, le rapport est consultable dans l'app et téléchargeable en PDF)
- Recherche et filtres avancés sur la liste des chantiers

Le but de la V1 est qu'Hendrix puisse l'utiliser en conditions réelles sur ses prochaines visites et valider que ça remplace son calepin.

### V2 — Consolidation

- **Export Google Drive** : envoi automatique du rapport sur le Drive de l'artisan dans un dossier structuré (1 dossier par chantier, avec le rapport + les photos brutes)
- **Mode hors-ligne** : captation complète sans connexion, synchro automatique au retour de la connexion
- **Historique et recherche** : rechercher dans tous ses rapports passés par nom de client, date, type de travaux
- **Partage de rapport** : lien de partage pour envoyer le rapport par email/SMS au client ou au bureau
- **Édition avancée du rapport** : réorganiser les observations, déplacer des photos d'une observation à l'autre
- **Multi-utilisateur par entreprise** : un patron voit les rapports de tous ses techniciens

### V3 — Pré-devis et intégrations

- **Génération de pré-devis** : à partir du rapport, l'IA génère des lignes de devis descriptives (libellés, quantités estimées) prêtes à copier-coller dans le logiciel de devis (Constructeur, etc.)
- **Intégration Constructeur** : connexion directe au logiciel de devis pour pré-remplir les lignes
- **Connexion à la base de prix** de l'artisan pour des estimations chiffrées

---

## 8. Métriques de succès

| Métrique | Objectif V1 |
|----------|-------------|
| Temps de captation sur le chantier | < 10 min pour un chantier standard (vs 15-20 min avec calepin) |
| Temps entre fin de visite et rapport disponible | < 2 minutes |
| Précision de la corrélation photo-observation | > 90% (validé par l'artisan) |
| Taux de modification du rapport après génération | < 20% des observations nécessitent une correction |
| Adoption | Hendrix utilise l'outil pour 100% de ses visites après 1 semaine |

---

## 9. Contraintes et risques

| Risque | Mitigation |
|--------|------------|
| Connexion 4G faible sur certains chantiers | V1 : informer l'utilisateur. V2 : mode hors-ligne. Compression agressive des photos côté client. |
| Vocabulaire BTP mal transcrit par Whisper | Utiliser Groq Whisper (meilleur sur le français technique). Permettre la correction manuelle. En V2 : prompt de contexte BTP pour améliorer la transcription. |
| Corrélation photo-observation incorrecte | L'artisan peut modifier le rapport après génération. L'IA utilise le contexte sémantique + la proximité chronologique. |
| Adoption par des artisans peu tech | Design ultra simple, 2 boutons principaux, zéro apprentissage. Formation par Julien (démo en 5 minutes). |
| Coût API (Whisper + GPT-4.1) | Estimer ~0.10-0.30€ par visite (quelques minutes d'audio Whisper + 1 appel GPT-4.1). Largement absorbé par l'abonnement mensuel. |

---

## 10. Annexes

### 10.1 Citations clés d'Hendrix (transcription)

> "Quand je prends des photos du chantier, je prends des photos de tout ce qu'il y a à faire. [...] Ce qui aurait été bien, c'est que quand je prends les photos, par exemple, je dis là, il faut ouvrir le mur porteur qui fait tant par tant [...] je prends des photos, là, le sol pour montrer que c'est un sol qui est à protéger."

> "Si t'arrives à trouver un système comme ça, tous les artisans sont preneurs."

> "C'est comme si j'avais un dictaphone, en fait, tu vois ? Un dictaphone qui me reprend tous mes trucs."

> "En fait, j'ai transmis tout ce que j'ai vu, tout ce que j'ai dans la tête sur l'ordi."

> "Les gars, ils étaient tous là avec leur calepin. Ils prenaient des notes, ils prenaient des photos, ils prenaient des notes, ils prenaient des photos. [...] C'est archaïque."

> "Je savais même pas sur quoi on allait travailler. Moi, dans ma tête, c'est un logiciel."

### 10.2 Abonnements IONNYX existants (référence tarification)

| Offre | Setup | Mensuel | Cible |
|-------|-------|---------|-------|
| SOLO | 1 500 € | 70 €/mois | 1 utilisateur |
| PRO | 2 500 € | 150 €/mois | 2-3 utilisateurs |
| BUSINESS | 4 000 € | 250 €/mois | Équipe complète |

### 10.3 Infrastructure existante IONNYX (à réutiliser si pertinent)

- Supabase (déjà utilisé pour CHECK'AO et le portail client)
- Groq Whisper (déjà utilisé dans les workflows n8n)
- OpenAI GPT-4.1 (déjà utilisé dans les workflows n8n)
- Google Drive API (déjà connectée dans les workflows n8n)
- Domaines : ionnyx.fr, ionnyx-ia.fr, ionnyx-btp.fr
