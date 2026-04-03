# CLAUDE.md — Mémoire persistante du projet

> Ce fichier est lu au début de chaque session et mis à jour à la fin. Il constitue la mémoire de travail entre les sessions.

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
- **Génération de rapport IA** — Claude (claude-sonnet-4-20250514) avec corrélation photos/observations
- **Affichage du rapport** — Observations groupées, édition inline, viewer photo plein écran
- **Export PDF** — Téléchargement local via html2canvas + jspdf
- **Suppression en cascade** — API DELETE /api/chantiers/[id] : supprime chantier + capture_items + rapport + fichiers Storage (audio + photos). RLS protège les données.
- **Déploiement** — GitHub (julien118/visite-technique-ionnyx) + Vercel (visite-technique-mtc37.vercel.app)

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
| **Profils utilisateurs** | Table `profiles` liée à `auth.users` avec trigger auto-création | Stocker company_name et futures préférences |
| **Suppression chantier** | API route DELETE + nettoyage Storage | Cascade DB via FK + suppression manuelle des fichiers Storage |
| **Déploiement** | Vercel (auto-deploy depuis GitHub) | Gratuit, intégration Next.js native |
| **Git config** | Email julien@ionnyx.fr | Nécessaire pour que Vercel Hobby accepte les commits |

### Note technique
- Le fichier `lib/openai.ts` est mal nommé — contient en réalité le client Anthropic. Héritage du switch GPT-4.1 → Claude, renommage pas encore fait.

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

*Dernière mise à jour : 2026-04-01 — Session 4 : déploiement GitHub/Vercel, header dynamique, suppression chantier, filtres/recherche, refonte design liste.*
