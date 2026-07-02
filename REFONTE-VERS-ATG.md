# REFONTE MTC37 → parité ATG « Système 30 Secondes »

> **À lire par le Claude Code du projet MTC37.** Ce document est le plan complet et auto-portant pour faire évoluer MTC37 (visite technique d'un maçon à Tours) afin qu'il **ressemble exactement à ATG** (le « Système 30 Secondes » d'Olivier GRAVIOU, façade/ravalement/ITE), **sans rien supprimer de ce qui marche déjà** chez MTC37.
>
> Rédigé après un audit source des **deux** dépôts (ATG = `…/ATG-SYSTEME30SEC`, MTC37 = ce dépôt). Les deux sont nés de la même base `assistant-visite` (Next.js 14 + Supabase). **MTC37 = ATG figé plus tôt.** ATG a été construit *après* MTC37, donc beaucoup plus mûr.
>
> Le repo ATG peut être fourni à côté pour copier directement des fichiers ; ce document inline néanmoins le code critique pour fonctionner même sans lui. Chaque brique est taguée **[UNIVERSEL]** (copier tel quel) ou **[SPÉCIFIQUE CLIENT]** (réécrire pour la maçonnerie).

---

## 0. Préambule & règles d'or

**Objectif business.** IONNYX industrialise ATG en SaaS **custom à ~80 %**. Ce qui change d'un artisan à l'autre = **le contenu du devis** (produits, modèles, qualifications, vocabulaire métier). Ce qui **ne change pas** = le système « 30 secondes » (visite → CR → devis depuis la bibliothèque produits/devis), l'IA, **la disposition ET la logique des boutons**, le branding, l'assistant conversationnel, le système de tickets. MTC37 est le **premier** clone.

**Règle de fidélité (exigée par Julien).** La **disposition des boutons** et la **logique des boutons** doivent être **identiques** à ATG. Mêmes positions (haut-gauche = retour, haut-droite = `?`/assistant, bas = CTA primaire), mêmes couleurs, mêmes libellés, mêmes transitions d'écran.

**🔒 À NE JAMAIS SUPPRIMER dans MTC37 (différences intentionnelles, conservées) :**
- L'intégration **pCloud** (livraison des rapports) : `lib/pcloud.ts`, `app/api/auth/pcloud/connect|disconnect`, `app/api/pcloud/upload-rapport`, colonnes `profiles.pcloud_auth_token` / `profiles.pcloud_email`, le bouton d'export pCloud dans le rapport.
- L'**auth multi-user** de MTC37 (`components/UserMenu.tsx`, `middleware.ts`, `lib/supabase/middleware.ts`, `/login`, RLS par `user_id`). ATG est mono-utilisateur (`ATG_USER_ID`) ; **MTC37 garde son modèle multi-user** — on adapte le branding *autour*, pas le modèle d'auth.
- Toute la **stack de surveillance** déjà en place (Telegram, cron, Sentry, model-health, usage-digest) : elle est déjà alignée sur ATG, ne pas régresser.
- Les champs métier MTC37 du chantier : `objet`, `provenance`, `type_chantier` (ATG les appelle différemment, voir §5).

**Les 5 garde-fous immuables d'ATG (à reproduire dans toute nouvelle brique) :**
1. **Séparation des comptes Costructor** — toute écriture passe par `assertCompteJulien()` ; le compte source reste en lecture seule tant que `ATG_COSTRUCTOR_CIBLE` ≠ ce compte.
2. **Cohérence du snapshot** — `assertSnapshotCoherentAvecCible()` empêche de pousser un devis-modèle lu sur un compte vers un autre (les IDs produits seraient invalides).
3. **Idempotence** — un re-push de devis supprime d'abord l'ancien (`supprimerDevis`) sauf mode « copie » ; les tickets matchent les réponses par `telegram_message_id` ; les logs d'usage sont *fire-and-forget*.
4. **Anti-hallucination** — partout où il y a un chiffre : **Claude analyse → le code calcule → Claude rédige**. Claude ne calcule jamais un montant ; il ne rédige qu'à partir de FAITS pré-calculés.
5. **Best-effort, no-crash** — monitoring, notifications et appels externes sont en try/catch avec timeouts et replis ; ne jamais faire planter un parcours pour une erreur secondaire.

**Ordre de refonte validé : UNIVERSEL d'abord.**
- **Phase 1** — Branding & UX (parité visuelle + logique des boutons). Gains rapides, risque quasi nul.
- **Phase 2** — Tickets « Demander à Julien » (100 % universel) + ossature de l'assistant.
- **Phase 3** — Moteur de devis + Costructor (cœur, contenu maçonnerie).

---

## 1. Cartographie ATG (le blueprint de référence)

### 1.1 Parcours utilisateur & routes

```
/chantiers ──▶ /chantiers/[id] ──▶ /chantiers/[id]/visite ──▶ /chantiers/[id]/rapport
(dashboard       (pivot contact)      (photos + dictée)          (CR IA + PDF +
 3 onglets)                                                       « Préparer mon devis »)
     │                                                                   │
     └───────────────────────────────────────────────┐                  ▼
                                          /chantiers/[id]/devis/recap ◀── /chantiers/[id]/devis
                                          (tableau + push Costructor)     (A: technique / B: métrés)

Lien court partageable : /r/[chantierId] → 302 → PDF du rapport (gravé dans le devis Costructor).
```

Le statut affiché (5 valeurs) est **dérivé** (jamais écrit en dur) ⇒ pilote les 3 onglets du dashboard et la route d'ouverture d'une carte.

### 1.2 Inventaire ATG par sous-système (avec tag)

| Sous-système | Fichiers ATG clés | Tag |
|---|---|---|
| Chrome/branding | `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/LogoLink.tsx`, `components/LogoutButton.tsx`, `public/*` (favicon, icônes PWA, logos, manifest) | UNIVERSEL (sauf logos/nom = client) |
| Statut dérivé | `lib/statut-affaire.ts`, `components/StatusBadge.tsx`, `components/ChantierCard.tsx`, `app/chantiers/chantiers-list.tsx` | UNIVERSEL |
| Tickets support | `components/AssistantTicket.tsx`, `components/VocalRecorderOgg.tsx`, `app/api/tickets/**`, `app/api/telegram-webhook/route.ts`, `lib/ticket-classifier.ts`, `lib/ticket-categories.ts`, `lib/ticket-telegram.ts`, `lib/notify.ts`, migrations `010`+`012` | UNIVERSEL |
| Assistant conversationnel | `components/AssistantDevis.tsx`, `components/AssistantGate.tsx`, `lib/assistant/**`, `lib/devis-historique.ts`, `app/api/assistant-devis/route.ts` | UNIVERSEL (archi) / CLIENT (données + accueil) |
| Moteur devis | `lib/quote-proposer.ts`, `lib/atg-devis-structure.ts`, `lib/atg-devis-modele.ts`, `lib/atg-routing.ts`, `lib/enrichir-devis.ts`, `lib/devis-sections-ordre.ts` | UNIVERSEL (archi) / CLIENT (contenu) |
| Costructor | `lib/costructor.ts`, `lib/costructor-compte.ts`, `lib/devis-idempotence.ts`, `lib/atg.ts` | UNIVERSEL |
| Front devis | `app/chantiers/[id]/devis/**`, `app/api/devis/**`, `app/r/[chantierId]/route.ts` | UNIVERSEL |
| IA / transcription | `lib/anthropic.ts`, `lib/transcription.ts`, `lib/prompts.ts`, `lib/rapport-pdf.ts` | UNIVERSEL (sauf prompts = client) |
| Monitoring | `lib/monitoring.ts`, `lib/usage.ts`, `lib/notify.ts`, `instrumentation*.ts`, `sentry.*`, `app/api/cron`, `app/api/model-health`, `app/api/usage-digest` | UNIVERSEL (déjà présent côté MTC37) |
| Données | `supabase/migrations/{001,002,005,007,010,012}*.sql` | UNIVERSEL (schéma) |

### 1.3 Modèle de données ATG (tables ajoutées au socle visite)
- `devis` : `sections_proposees`/`sections_finales` (JSONB `SectionDevis[]`), `total_ht`/`total_ttc`, `tva_taux`, `costructor_devis_id`/`costructor_devis_url`, `moteur` (`plat|clonage`), `modele_id`, `modele_snapshot` (JSONB), `statut`.
- `bibliotheque_costructor` : `costructor_article_id` (unique), `libelle`, `unite`, `prix_vente`, `mots_cles[]`.
- `tickets` + `ticket_messages` (fils de discussion support).
- `usage_logs` (déjà présent chez MTC37).
- Buckets Storage : `photos` (public), `audio` (privé), **`rapports`** (public — PDF + lien court `/r`).

---

## 2. Audit MTC37 (état actuel) & écart

### 2.1 Ce que MTC37 a DÉJÀ (à conserver tel quel)
- **Parcours visite complet** : `/chantiers` (dashboard liste, filtres, recherche, tri, cartes), `/chantiers/nouveau`, `/chantiers/[id]`, `/chantiers/[id]/visite` (timeline photos + vocaux, liaison photo↔vocal), `/chantiers/[id]/rapport` (CR IA, édition inline, viewer photo, export PDF + pCloud + nouveau rapport).
- **Composants** : `AddressAutocomplete`, `AudioRecorder`, `CaptureItem`, `ChantierCard`, `ChantierForm`, `DeleteChantierModal`, `PhotoCapture`, `ReportView`, `StatusBadge`, `UserMenu`.
- **IA** : `lib/openai.ts` = **client Anthropic** (nom hérité, c'est bien Claude avec `MODEL_CHAIN`), `lib/prompts.ts` (`SYSTEM_PROMPT_RAPPORT` détaillé), transcription **Groq Whisper** via `/api/transcribe`.
- **pCloud** : `lib/pcloud.ts`, `app/api/auth/pcloud/*`, `app/api/pcloud/upload-rapport` (dossier « 2 ETUDES-DEVIS »).
- **Auth multi-user** : Supabase Auth email/mdp, `middleware.ts`, `lib/supabase/middleware.ts`, `UserMenu` (affiche `company_name`), RLS par `user_id`.
- **Monitoring** : `lib/monitoring.ts`, `lib/usage.ts`, `lib/notify.ts`, `instrumentation*.ts`, `sentry.*`, `app/api/cron` (keep-alive + digests + model-health), `app/api/usage-digest`, `app/api/model-health`, `app/api/client-error`. **Déjà à parité ATG.**
- **Schéma** : `chantiers` (avec `objet`, `provenance`, `type_chantier`), `capture_items` (`linked_photo_id`), `rapports`, `profiles` (avec `pcloud_*`), `usage_logs`. Buckets `audio` (privé) + `photos` (public).

### 2.2 Ce qui MANQUE vs ATG (le delta à construire)

| Brique manquante | Fichiers ATG à porter | Le socle MTC37 le supporte-t-il ? |
|---|---|---|
| **Moteur de devis (2 moteurs)** | `lib/quote-proposer.ts`, `lib/atg-devis-*.ts`, `lib/atg-routing.ts`, `lib/enrichir-devis.ts`, `lib/devis-sections-ordre.ts` | Oui (ajout de tables + pages) |
| **Costructor** | `lib/costructor.ts`, `lib/costructor-compte.ts`, `lib/devis-idempotence.ts` | Oui |
| **Front devis** | `app/chantiers/[id]/devis/**`, `app/api/devis/**`, `app/r/[chantierId]` | Oui |
| **Assistant conversationnel** | `lib/assistant/**`, `lib/devis-historique.ts`, `components/AssistantDevis.tsx`, `components/AssistantGate.tsx`, `app/api/assistant-devis` | Oui (CR dès Phase 2 ; devis/clients en Phase 3) |
| **Tickets « Demander à Julien »** | `components/AssistantTicket.tsx`, `components/VocalRecorderOgg.tsx`, `app/api/tickets/**`, `app/api/telegram-webhook`, `lib/ticket-*.ts`, migrations `010`+`012` | Oui (`lib/notify.ts` déjà là) |
| **Branding mûr** | bannière `#1A1A1A`, `LogoLink`, favicon/PWA, tokens Tailwind, `lib/statut-affaire.ts`, onglets 3-statuts | Oui (purement front) |
| **Bucket `rapports` + lien court `/r`** | bucket public + `app/r/[chantierId]/route.ts` | À ajouter (Phase 3) |

### 2.3 Différences à PRÉSERVER (ne pas « aligner » sur ATG)
- **Auth** : MTC37 reste multi-user. **Ne pas** importer le mode `ATG_USER_ID` / la lecture `profiles` en dur d'ATG. On garde `UserMenu` + RLS.
- **Livraison rapport** : pCloud reste le canal d'archivage. Le bucket `rapports` + `/r` s'ajoutent **en plus** (uniquement pour le lien public gravé dans le devis), ils ne remplacent pas pCloud.
- **Champs chantier** : garder `objet`/`provenance`/`type_chantier` (mapper vers la logique devis, voir §5.1).

---

## 3. PHASE 1 — Branding & UX (parité visuelle + logique des boutons)

> But : à la fin de cette phase, MTC37 doit **ressembler** à ATG (bannière noire, favicon, onglets, boutons aux mêmes places) **sans aucune fonctionnalité devis encore**. 100 % front, aucun risque sur l'existant.

### 3.1 Tokens Tailwind — `tailwind.config.ts` [UNIVERSEL — copier verbatim]

Remplacer le `theme.extend` de MTC37 par celui d'ATG (couleurs + fonte Inter + keyframes/animations) :

```ts
// tailwind.config.ts — theme.extend
colors: {
  primary: { DEFAULT: '#10B981', dark: '#059669' },
  header: '#1A1A1A',
  background: '#F8FAFC',
  foreground: '#111827',
  border: '#E5E7EB',
  'input-bg': '#F9FAFB',
  'input-focus': '#ECFDF5',
  'focus-ring': 'rgba(16, 185, 129, 0.15)',
},
fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] },
keyframes: {
  'slide-up':    { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
  'scale-in':    { '0%': { transform: 'scale(0.95)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
  'fade-in':     { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
  'card-appear': { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
  'pulse-record':{ '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)' }, '50%': { boxShadow: '0 0 0 12px rgba(239, 68, 68, 0)' } },
  'slide-down':  { '0%': { transform: 'translateY(-100%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
},
animation: {
  'slide-up': 'slide-up 0.3s ease-out',
  'scale-in': 'scale-in 0.28s ease-out',
  'fade-in': 'fade-in 0.2s ease-out',
  'card-appear': 'card-appear 0.25s ease-out',
  'pulse-record': 'pulse-record 1.5s ease-in-out infinite',
  'slide-down': 'slide-down 0.3s ease-out',
},
```

### 3.2 Design system — `app/globals.css` [UNIVERSEL — copier verbatim]

Porter les `@layer components` (boutons/inputs/badges/action-links) + `@layer utilities` (safe-area, skeleton, page-enter, hauteurs mobiles) d'ATG. Extrait des classes-clés (la source complète est dans `ATG/app/globals.css`) :

```css
@layer base {
  /* Anti-zoom iOS — inputs >= 16px */
  input, select, textarea { font-size: 16px; }
  body {
    @apply bg-background text-foreground;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-xl px-6 py-3 text-white font-semibold text-base transition-all duration-200 ease-out;
    background: linear-gradient(135deg, #10B981, #059669);
    box-shadow: 0 4px 14px rgba(16,185,129,0.35);
  }
  .btn-primary:hover  { box-shadow: 0 6px 20px rgba(16,185,129,0.45); }
  .btn-primary:active { transform: scale(0.97); }
  .btn-primary:disabled { @apply cursor-not-allowed; background:#e5e7eb; color:#9ca3af; transform:none; box-shadow:none; }

  .btn-secondary { @apply inline-flex items-center justify-center rounded-xl px-6 py-3 bg-header text-white font-semibold text-base transition-all duration-200 ease-out; }
  .btn-secondary:hover { @apply bg-gray-800; } .btn-secondary:active { transform: scale(0.97); } .btn-secondary:disabled { @apply opacity-50 cursor-not-allowed; }

  .btn-tertiary { @apply inline-flex items-center justify-center rounded-xl px-6 py-3 bg-white text-foreground font-medium text-base border border-border transition-all duration-200 ease-out; }
  .btn-tertiary:hover { @apply border-primary text-primary; } .btn-tertiary:active { transform: scale(0.97); } .btn-tertiary:disabled { @apply opacity-50 cursor-not-allowed; }

  .input-ionnyx { @apply w-full rounded-xl px-4 py-3 bg-input-bg border border-border text-foreground placeholder-gray-400 transition-all duration-200 ease-out; font-size:16px; }
  .input-ionnyx:focus { @apply bg-input-focus border-primary outline-none; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }

  .action-link { @apply inline-flex items-center gap-1.5 min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-colors; }
  .action-link:hover { @apply bg-primary/5; } .action-link:active { @apply bg-primary/10; }
  .action-link-danger { @apply text-red-600; } .action-link-danger:hover { @apply bg-red-50; } .action-link-danger:active { @apply bg-red-100; }

  .badge-en-cours { @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium; }
  .badge-termine  { @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium; }
  .badge-rapport  { @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium; }
}
@layer utilities {
  .pt-safe { padding-top: calc(env(safe-area-inset-top) + 8px); }
  .pb-safe { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  .mb-safe { margin-bottom: max(12px, env(safe-area-inset-bottom)); }
  .skeleton { @apply bg-gray-200 rounded-lg animate-pulse; }
  .page-enter { animation: page-enter 0.25s ease-out; }
  .h-screen-safe { height: 100vh; height: 100dvh; }
  .min-h-screen-safe { min-height: 100vh; min-height: 100dvh; }
}
@keyframes page-enter { 0% { opacity:0; transform:translateY(8px);} 100% { opacity:1; transform:translateY(0);} }
```

### 3.3 Layout racine — `app/layout.tsx` [UNIVERSEL, adapter le nom]

Reproduire la structure ATG : fonte Inter, métadonnées + favicon + manifest + appleWebApp, viewport `themeColor #10B981`, **app-shell** (1 seul conteneur scrollable), montage global de `ToastProvider` + `AssistantGate`.

```tsx
import { Inter } from 'next/font/google'
import ToastProvider from '@/components/ToastProvider'
import AssistantGate from '@/components/AssistantGate'      // ajouté en Phase 2/3
import './globals.css'
const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'MTC37 — Système 30 Secondes',                     // ← nom client
  description: 'Système 30 Secondes par IONNYX',
  manifest: '/manifest.json',
  openGraph: { title: 'MTC37 — Système 30 Secondes', description: 'Système 30 Secondes par IONNYX', siteName: 'MTC37', locale: 'fr_FR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'MTC37 — Système 30 Secondes', description: 'Système 30 Secondes par IONNYX' },
  icons: { icon: [ { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' } ], apple: '/apple-touch-icon.png' },
  appleWebApp: { title: 'Système 30 Secondes', capable: true },
  robots: { index: false, follow: false },
}
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#10B981' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.className} h-screen-safe flex flex-col`}>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ToastProvider>{children}</ToastProvider>
        </div>
        <AssistantGate />   {/* Phase 2/3 — assistant flottant, masqué sur /login */}
      </body>
    </html>
  )
}
```

> ⚠️ MTC37 n'a pas encore `ToastProvider` ni `AssistantGate` : `ToastProvider` est à porter en Phase 1 (utile partout), `AssistantGate` arrive avec l'assistant (Phase 2/3). En attendant, retirer la ligne `<AssistantGate />`.

### 3.4 Bannière noire & logo — `components/LogoLink.tsx` [UNIVERSEL, logo = client]

```tsx
import Link from 'next/link'
import Image from 'next/image'
export default function LogoLink({ priority = false }: { width?: number; height?: number; priority?: boolean }) {
  return (
    <Link href="/chantiers" className="inline-flex items-center select-none">
      <Image src="/logo-mtc37-blanc.png" alt="MTC37" width={128} height={48} priority={priority} className="h-10 w-auto" />
    </Link>
  )
}
```

> **Logo client** : Julien fournit `public/logo-mtc37-blanc.png` (logo blanc sur fond sombre, sans numéro de téléphone, ratio ~8:3, 128×48). En attendant, réutiliser un placeholder. L'affichage `h-10 w-auto` est figé (ne pas changer la taille).

### 3.5 Patron de header (réutilisé sur CHAQUE écran) [UNIVERSEL — fidélité boutons]

C'est le cœur de la « disposition identique des boutons ». Bannière `bg-header` sticky, **logo à gauche**, **zone d'actions à droite** (`?` ticket + menu utilisateur), et sur les sous-écrans une **flèche retour en haut-gauche**.

**Dashboard `/chantiers` — header (adapté à l'auth multi-user MTC37) :**

```tsx
<header className="sticky top-0 z-30 bg-header border-b border-white/10 px-5 py-4 pt-safe flex items-center justify-between">
  <LogoLink />
  <div className="flex items-center gap-3">
    <AssistantTicket />                          {/* bouton « ? » — Phase 2 */}
    {/* MTC37 garde son UserMenu multi-user, restylé pour la bannière noire :
        masqué sur téléphone (sm:flex), visible sur ordinateur. Le « ? » reste visible partout. */}
    <div className="hidden sm:flex items-center gap-3">
      <UserMenu />     {/* ← garder le composant MTC37, pas le LogoutButton single-user d'ATG */}
    </div>
  </div>
</header>
```

> **Différence clé vs ATG** : ATG affiche `prénom nom` + `LogoutButton` (lus depuis un profil en dur). **MTC37 garde `UserMenu`** (multi-user). On le **restyle** pour le fond noir (texte `text-gray-200`, hover `text-white`), mais on **ne change pas** sa logique d'auth.

**Sous-écran (visite / rapport / devis) — header avec retour :**

```tsx
<header className="flex-shrink-0 sticky top-0 z-30 bg-header border-b border-white/10 px-5 py-4 pt-safe flex items-center gap-3">
  <Link href="/chantiers/[id]" className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
    {/* chevron gauche SVG */}
  </Link>
  <div className="flex-1 min-w-0">
    <LogoLink />
    <p className="text-xs text-gray-300 truncate">{client_nom}</p>
  </div>
  <AssistantTicket className="shrink-0" />     {/* Phase 2 */}
</header>
```

### 3.6 Patron app-shell (visite / rapport / devis) [UNIVERSEL]
Header `flex-shrink-0` figé en haut + **un seul** conteneur `flex-1 min-h-0 overflow-y-auto` au milieu + footer d'actions épinglé `fixed bottom-0 … pb-safe` portant l'attribut `data-bottombar`. Évite le double-scroll iOS et garde les CTA accessibles. (MTC37 a déjà un header fixe iOS — réaligner sur ce patron exact.)

### 3.7 Favicon & PWA [UNIVERSEL, assets = client]
Déposer dans `public/` : `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png` (versions MTC37). Remplacer `public/manifest.json` par :

```json
{
  "name": "Système 30 Secondes",
  "short_name": "Système 30 Secondes",
  "description": "Système 30 Secondes par IONNYX",
  "start_url": "/chantiers",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#10B981",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 3.8 Statut dérivé + onglets + cartes [UNIVERSEL — copier verbatim]

**`lib/statut-affaire.ts`** — source de vérité unique (fonction PURE, 5 statuts) :

```ts
export type StatutAffiche = 'planifie' | 'en_cours' | 'rapport_genere' | 'devis_en_cours' | 'devis_envoye'
export type SectionAffaire = 'visite_technique' | 'devis'
export interface EntreeStatut { chantierStatut: ChantierStatut; aCompteRendu: boolean; devisStatut: DevisStatut | null | undefined }

export function deriverStatutAffiche({ chantierStatut, aCompteRendu, devisStatut }: EntreeStatut): StatutAffiche {
  if (devisStatut === 'pousse_costructor') return 'devis_envoye'
  if (devisStatut) return 'devis_en_cours'
  if (aCompteRendu) return 'rapport_genere'
  if (chantierStatut !== 'planifie') return 'en_cours'
  return 'planifie'
}
export function sectionDe(s: StatutAffiche): SectionAffaire {
  return s === 'devis_en_cours' || s === 'devis_envoye' ? 'devis' : 'visite_technique'
}
```

> **Avant la Phase 3** (pas encore de table `devis`), `devisStatut` vaut toujours `null` ⇒ seuls 3 statuts apparaissent (planifié / en cours / rapport généré) et l'onglet **Devis** reste vide. Le code est déjà prêt pour quand le devis arrivera. Côté requête, retirer l'embed `devis(...)` tant que la table n'existe pas, puis le rajouter en Phase 3 (voir le dashboard ATG `app/chantiers/page.tsx`).

**`components/StatusBadge.tsx`** — 5 badges (emoji + couleurs) :

```tsx
const CONFIG: Record<StatutAffiche, { label: string; icon: string; className: string }> = {
  planifie:       { label: 'Planifié',        icon: '📅', className: 'bg-blue-50 text-blue-700' },
  en_cours:       { label: 'En cours',        icon: '🔨', className: 'bg-amber-50 text-amber-700' },
  rapport_genere: { label: 'Rapport généré',  icon: '📄', className: 'bg-emerald-50 text-emerald-700' },
  devis_en_cours: { label: 'Devis en cours',  icon: '📝', className: 'bg-violet-50 text-violet-700' },
  devis_envoye:   { label: 'Devis envoyé',    icon: '📤', className: 'bg-teal-50 text-teal-700' },
}
export default function StatusBadge({ statut }: { statut: StatutAffiche }) {
  const { label, icon, className } = CONFIG[statut]
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}><span>{icon}</span>{label}</span>
}
```

**Dashboard (`chantiers-list.tsx`)** — 3 onglets `bg-gray-100 rounded-xl p-1` (« Tous » / « Visite technique » (court « Visite ») / « Devis ») avec compteurs (`bg-primary/10 text-primary` actif), barre de recherche `input-ionnyx pl-10`, FAB `+` `fixed bottom-8 right-5 mb-safe w-14 h-14 btn-primary rounded-full`, liste `space-y-3` de `ChantierCard`.

**`ChantierCard`** — carte `bg-white rounded-xl border p-4 active:scale-[0.98] animate-card-appear`, nom + `StatusBadge` + **icône corbeille** (`h-9 w-9 hover:text-red-500 hover:bg-red-50`, `stopPropagation`, **appui long 600 ms** → `DeleteChantierModal`, ne supprime jamais directement), route d'ouverture via `getChantierHref` (section devis → `/devis` ; rapport/terminé → `/rapport` ; sinon `/[id]`).

### 3.9 Spec bouton-par-bouton (table de fidélité)

| Écran | Haut-gauche | Haut-droite | CTA bas (footer épinglé) | Autres |
|---|---|---|---|---|
| `/chantiers` | Logo | `?` ticket + UserMenu | — | FAB `+` (vert, rond, bas-droite) ; onglets ; recherche |
| `/chantiers/nouveau` | ⬅ retour `/chantiers` | Logo + `?` | « Créer la visite » (`btn-primary`) | — |
| `/chantiers/[id]` (pivot) | ⬅ retour | Logo + `?` | « Commencer » (planifié) / « Continuer la visite » (en cours) | redirige vers `/rapport` si CR existe |
| `/visite` | ⬅ retour `/[id]` | Logo+client + `?` | rangée Photo + Audio, puis « Terminer la visite » (`btn-primary`) | timeline ; mode « Décrivez cette photo » |
| `/rapport` | ⬅ retour `/chantiers` | Logo+client + `?` | « Préparer mon devis » (`btn-primary`) ou « Continuer mon devis » (`btn-tertiary`) si devis existe | export PDF + **pCloud** (conservés) |
| `/devis` (Phase 3) | ⬅ retour `/rapport` | Logo + `?` | « Aller au récap » | A technique / B métrés |
| `/devis/recap` (Phase 3) | ⬅ retour `/devis` | Logo + `?` | « Pousser sur Costructor » | `BlocTotaux` (TVA) |

> Couleurs : primaire **`#10B981`** seul accent ; header **`#1A1A1A`** ; fond **`#F8FAFC`**. Danger (supprimer) = `bg-red-600`. Inputs **16px** mini (anti-zoom iOS). Tout écran : `pt-safe`/`pb-safe`/`mb-safe`.

---

## 4. PHASE 2 — Tickets « Demander à Julien » + assistant

### 4.1 Tickets support [UNIVERSEL — 100 % portable, AUCUNE dépendance Costructor]

C'est l'un des deux « plus » qu'a cités Julien : un bouton `?` dans la bannière → le client écrit/dicte une demande → **notification Telegram chez Julien** → Julien répond *dans Telegram* → la réponse **apparaît in-app** dans « Mes demandes » (badge non-lus). Tri par thématique (IA), fils de discussion, vocal natif OGG.

**Migrations** (porter `010_tickets.sql` + `012_ticket_threads.sql`) :

```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  chantier_id UUID,
  message TEXT NOT NULL,                 -- 1er message (legacy/aperçu)
  contexte JSONB NOT NULL DEFAULT '{}',  -- { path, chantierId, chantierLabel, viewport, userAgent }
  statut TEXT NOT NULL DEFAULT 'ouvert', -- 'ouvert' | 'resolu'
  telegram_message_id BIGINT,            -- pour matcher la réponse de Julien
  lu_par_olivier BOOLEAN NOT NULL DEFAULT true,
  categorie TEXT,                        -- 'probleme'|'amelioration'|'question'|'autre'
  titre TEXT,                            -- résumé IA 3–6 mots
  derniere_activite_le TIMESTAMPTZ
);
CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  auteur TEXT NOT NULL,                  -- 'olivier' (= le client) | 'julien'
  texte TEXT NOT NULL,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_user_created ON tickets (user_id, created_at DESC);
CREATE INDEX idx_tickets_telegram_msg ON tickets (telegram_message_id);
```

> ⚠️ Renommer mentalement « olivier » → « le client » : la valeur `auteur='olivier'` est juste l'étiquette « émetteur côté app ». Garder la valeur littérale pour rester iso-ATG, ou la généraliser en `'client'` (cohérent partout : routes + frontend). **Recommandation : garder `'olivier'`/`'julien'`** pour un copier-coller sans friction, l'UI affiche « Vous » / « Julien » de toute façon.

**Routes à porter** (verbatim, `app/api/tickets/**` + `app/api/telegram-webhook/route.ts`) :
- `POST /api/tickets` : parse message + contexte (+ audio OGG/webm optionnel) → enrichit le contexte (label chantier) → `analyserMessage()` (catégorie + titre IA) → insert `tickets` + 1er `ticket_messages (auteur='olivier')` → `sendTelegramAvecId()` (stocke le `message_id`) → `sendTelegramFichierAudio()` si vocal. Retour `{ ok, id, notifEnvoyee }`.
- `GET /api/tickets` : liste résumée + `nonLus` (en-têtes `no-store`).
- `GET /api/tickets/[id]` : fil complet (`no-store`).
- `POST /api/tickets/[id]/messages` : ajoute un message au fil.
- `POST /api/tickets/[id]/resolu` : marque résolu / rouvre.
- `POST /api/tickets/lu` : enlève la pastille non-lus.
- `POST /api/telegram-webhook` : Telegram envoie la réponse de Julien (`reply_to_message.message_id = N`) → retrouve `tickets.telegram_message_id = N` → insert `ticket_messages (auteur='julien')` → `statut='resolu'` + `lu_par_olivier=false` → 200.

**Libs à porter** : `lib/ticket-classifier.ts` (`analyserMessage` → `{ categorie, titre }`, Claude 1-shot temp 0, timeout 12 s, fail-open `{categorie:'autre', titre:''}`), `lib/ticket-categories.ts` (`normaliserCategorie`), `lib/ticket-telegram.ts` (formatage). **`lib/notify.ts` existe déjà côté MTC37** — vérifier qu'il expose `sendTelegram`, `sendTelegramAvecId` (retourne `message_id`) et `sendTelegramFichierAudio` (OGG → `sendVoice`, sinon `sendDocument`) ; sinon compléter depuis ATG.

**Frontend** : porter `components/AssistantTicket.tsx` + `components/VocalRecorderOgg.tsx` + `public/opus/encoderWorker.min.js`. Détails de fidélité :
- **Bouton** dans la bannière : `relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-white/10 active:scale-95`, icône `?` (h-5 w-5), aria-label « Aide — contacter Julien ». **Badge non-lus** : `absolute -top-0.5 -right-0.5 h-4 min-w-4 … bg-red-600 text-white text-[10px] ring-2 ring-header`.
- **Panneau** (sous la bannière, droite) : header noir « Demander à Julien » / « Question, souci ou idée », onglets **Nouveau message** / **Mes demandes (N)**, vue conversation (bulles `bg-primary` à droite = client, `bg-white border` à gauche = Julien), composer texte + `VocalRecorderOgg` + bouton « Envoyer à Julien » / « Répondre ».
- **Polling** : `/api/tickets` toutes les 30 s panneau ouvert ; `/api/tickets/[id]` toutes les 10 s en conversation ; refresh au focus ; marquer lu à l'ouverture.

**Webhook Telegram** : exécuter `scripts/setup-telegram-webhook.mts` (à porter) pour pointer le bot vers `https://<domaine-mtc37>/api/telegram-webhook`. Le bot Telegram peut être le même (multi-tenant via `DEPLOYMENT_NAME`) ou dédié — **utiliser un chat/bot dédié MTC37** pour ne pas mélanger les fils avec ceux d'ATG.

### 4.2 Assistant conversationnel [UNIVERSEL archi / SPÉCIFIQUE données + accueil]

Le second « plus » cité par Julien : un assistant flottant **lecture seule** qui s'appuie sur **toutes les données** (comptes rendus, devis, clients) avec **anti-hallucination** (Claude analyse → le code calcule → Claude rédige).

- **Libs** : `lib/assistant/**` (`aiguilleur` = routeur de domaine `devis|comptes_rendus|clients|recap_client|inconnu` ; `orchestrateur` ; `domaine-comptes-rendus` ; `domaine-clients` ; `domaine-recap` ; `rediger` ; `historique` = mémoire de conversation ; `matching-nom` = tolérance aux fautes) + `lib/devis-historique.ts` (domaine devis, chaîne 3-temps). Route `app/api/assistant-devis/route.ts`.
- **Front** : `components/AssistantDevis.tsx` (bouton flottant rond vert bas-droite, fenêtre de chat, message d'accueil + 4 exemples cliquables, micro compact, candidats cliquables pour homonymes) + `components/AssistantGate.tsx` (ne monte rien sur `/login`).
- **Contrat API** `POST /api/assistant-devis` : `{ question, dernierClient?, historique?, clientForce?, domaineForce? }` → `{ reponse, domaine?, nb?, clientContexte?, candidats? }`.

**Dépendance de phase (important) :**
- Le domaine **comptes-rendus** lit la table `rapports` (Supabase) ⇒ **fonctionne dès la Phase 2**.
- Le domaine **clients** fusionne contacts Costructor + table `chantiers` ⇒ partiellement fonctionnel pré-Phase 3 (lit les fiches app via `chantiers`), pleinement après Costructor.
- Le domaine **devis** lit les devis via Costructor ⇒ **actif en Phase 3**.

**Recommandation de séquencement honnête :** livrer en Phase 2 les **tickets en entier** + l'assistant **limité au domaine comptes-rendus** (et fiches app via `chantiers`), avec un repli propre des domaines devis/clients (« je pourrai répondre à ça dès que vos devis seront connectés »). Activer pleinement l'assistant (devis + clients Costructor) en fin de Phase 3.

**À adapter [SPÉCIFIQUE]** : message d'accueil « Bonjour {prénom}, … » (lire le profil MTC37 / `company_name`), `SOURCES_CONSULTABLES`, les 4 exemples de questions (orientés maçonnerie), `DEPLOYMENT_NAME`.

---

## 5. PHASE 3 — Moteur de devis (cœur, Costructor)

> **Décision validée : MTC37 utilise Costructor aussi.** On réutilise **toute** l'architecture devis d'ATG ; seul le **contenu** change (produits maçonnerie, devis-modèles, qualifications, vocabulaire). C'est la partie « 20 % spécifique ».

### 5.1 Schéma & données

**Migrations à porter** (`002` partie devis + `005`) :

```sql
CREATE TABLE devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  statut TEXT DEFAULT 'brouillon',  -- brouillon|sections_proposees|metres_en_cours|pousse_costructor|echec
  sections_proposees JSONB,         -- SectionDevis[] (éditable)
  sections_finales   JSONB,         -- SectionDevis[] (validé, envoyé à Costructor)
  total_ht NUMERIC, total_ttc NUMERIC, tva_taux NUMERIC DEFAULT 10,
  costructor_devis_id TEXT, costructor_devis_url TEXT, pousse_le TIMESTAMPTZ, erreur_push TEXT,
  moteur TEXT NOT NULL DEFAULT 'plat',  -- 'plat' | 'clonage'
  modele_id TEXT, modele_snapshot JSONB,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE bibliotheque_costructor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  costructor_article_id TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL, unite TEXT NOT NULL, prix_vente NUMERIC NOT NULL,
  mots_cles TEXT[], synchronise_le TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_devis_chantier_id ON devis (chantier_id);
```

> **RLS** : MTC37 étant multi-user, ajouter des **policies par `user_id`** sur `devis` (via le `chantier` du user, comme `capture_items`/`rapports`) et sur `bibliotheque_costructor` (lecture pour tous les authentifiés, écriture service-role). ATG les avait désactivées (mono-user) ; **MTC37 ne désactive pas la RLS**.

**Bucket `rapports`** (public) à créer + **lien court** `app/r/[chantierId]/route.ts` (302 → PDF). Sert à graver dans le devis Costructor une URL propre du compte rendu. **pCloud reste en parallèle** (archivage).

**Cascade de suppression** : étendre `app/api/chantiers/[id]/route.ts` (DELETE) pour nettoyer aussi le `devis` lié + le PDF orphelin du bucket `rapports`. **Ne jamais** toucher au devis Costructor distant.

**Mapping des champs chantier** : ATG lit `objet_travaux` ; MTC37 a `objet` (+ `provenance`, `type_chantier`). Dans le moteur de devis porté, remplacer les lectures `objet_travaux` par `objet` (le « signal » de routing/typologie côté maçon vient de `objet` + la dictée de visite).

### 5.2 Costructor [UNIVERSEL — copier]

- `lib/costructor.ts` : SDK Bearer ; `trouverOuCreerContact` (match email > tél > nom, sinon création ; reliage seulement si signal fort ET noms concordants) ; `construirePayloadDevis` (HTML **groupé par section** — requis par le renderer Costructor des comptes assujettis) ; `supprimerDevis` (idempotence via `POST /quotes/{id}/delete`, le `DELETE` renvoie 405) ; `stripHtml` + `decoderEntitesHtml` ; `uniteVersCostructorId` ; `eurosVersCentimes`.
- `lib/costructor-compte.ts` : `compteCibleCostructor()` (`ATG_COSTRUCTOR_CIBLE`, défaut `'test'`), `assertCompteJulien()` (garde d'écriture), `assertSnapshotCoherentAvecCible()`, `bannerCompte()`, lecture seule du compte source.
- `lib/devis-idempotence.ts` : stockage du snapshot.

**Quirks API Costructor (inlinés, à respecter)** : méta-params préfixés `_underscore` (`_expand`, `_limit`, `_sort`) — sans underscore, ignorés ; `GET /quotes` plafonné à 10 sans `_limit` ; filtres `/contacts` ignorés (filtrer côté app) ; `DELETE /quotes` et `DELETE /contacts` → 405 ; `DELETE /products` refusé si produit utilisé ; vue `lines` imbriquée redondante (ne pas récurser, le niveau racine fait foi) ; le n° `D-AAAA-…` n'est attribué qu'au passage `open` (on pousse des **brouillons**) ; TVA portée **ligne par ligne** (`taxRate` en points de base, 1000 = 10 %).

**Constantes d'unités/TVA** : les IDs d'unités Costructor (`UNIT_M2`, `UNIT_ML`, `UNIT_U`, `UNIT_M3`, `UNIT_ENS`) sont **partagés entre instances Costructor** (réutilisables). L'ID de **taxe** (`TAX_TVA_10`) et surtout les **IDs produits/devis-modèles** sont **spécifiques au compte** ⇒ à régénérer pour MTC37.

### 5.3 Les deux moteurs [UNIVERSEL archi]

Type partagé (les deux moteurs produisent la même chose) :

```ts
export interface SectionDevis { nom: string; articles: ArticleDevis[] }
export interface ArticleDevis {
  costructor_article_id: string
  libelle: string
  unite: string
  prix_vente: number
  quantite: number | null            // null tant que les métrés ne sont pas saisis
  description_technique: string       // IA, 100–150 car., ancrée au contexte
  ref_modele?: string                 // clonage : lien vers la ligne du devis-modèle
}
```

- **Moteur PLAT** (`lib/quote-proposer.ts` + `lib/atg-devis-structure.ts`) : Claude choisit des articles **de la bibliothèque** + rédige des descriptions courtes ; **whitelist serveur** = on ne garde que les articles dont l'`costructor_article_id` existe en base (Claude ne peut jamais inventer un produit). `STRUCTURE_DEVIS_ATG` = en-tête qualifications + sections transversales captées par mots-clés.
- **Moteur CLONAGE** (`lib/atg-devis-modele.ts`) : lit un **devis-modèle** Costructor (`model:true`, via `_expand=lines`), **snapshot figé** à la dérivation, **reconstruction au push** (`reconstruireDepuisSnapshot`) qui réinjecte les quantités par `ref_modele`, **recopie la TVA ligne par ligne** et les **ouvrages** (`productType:'work'` + `supplies` en objets, `sellPriceForced:false`).
- **Aiguillage** (`lib/atg-routing.ts`, `choisirModele`) : score chaque modèle par recouvrement de mots entre le signal (objet + dictée) et le nom/description du modèle. Famille franche + modèle trouvé → clonage ; sinon → **plat** (fail-safe try/catch ⇒ jamais d'écran cassé).
- **Enrichissement** (`lib/enrichir-devis.ts`, `lib/devis-sections-ordre.ts`) : pré-fil des quantités depuis les métrés, points singuliers, ré-écriture des descriptions selon le contexte.

### 5.4 Front devis [UNIVERSEL]
- `app/chantiers/[id]/devis/` : `devis-editeur.tsx` (**Phase A** proposition technique : renommer/ajouter/supprimer des sections, éditer descriptions, remplacer un article par autocomplétion bibliothèque ; **Phase B** métrés : saisie manuelle + **dictée vocale**, auto-save débouncé) ; `recap/` (`page.tsx` tableau style Costructor, `bloc-totaux.tsx` = TVA, `bouton-pousser.tsx` = animation push, mode « remplacer » / « créer une copie »).
- `app/api/devis/**` : `proposer` (plat ou clonage, garde anti-écrasement), `metres-vocaux` (transcription + parsing unité-aware), `articles` (GET bibliothèque pour autocomplétion), `modeles` (GET liste des modèles), `pousser` (push idempotent), `tva` (taux).
- Bouton « **Préparer mon devis** » (footer du rapport) → `proposer` → `/devis`. « **Continuer mon devis** » si un devis existe déjà.

### 5.5 À RECONSTRUIRE pour la maçonnerie [SPÉCIFIQUE CLIENT — les « 20 % »]

1. **Compte/clé Costructor MTC37** + `ATG_COSTRUCTOR_CIBLE='test'` au départ (le compte MTC37 sert de cible test ; passage « olivier→MTC37 » identique à la bascule ATG).
2. **Bibliothèque produits maçonnerie** : peupler `bibliotheque_costructor` + les produits Costructor (script type `reseed-bibliotheque-*.mjs`). Intitulés et prix = vrais devis du maçon.
3. **Devis-modèles** Costructor (`model:true`) par typologie maçonnerie (ex. *reprise de maçonnerie / enduit de façade / jointoiement pierre / création d'ouverture / dallage / mur de clôture…*). Ce sont eux qui alimentent le moteur de clonage.
4. `lib/atg-devis-structure.ts` → **qualifications** du maçon (assurances, certifications) + sections transversales pertinentes (installation/repli, échafaudage, évacuation gravats…).
5. `lib/atg-routing.ts` → `MOTS_*` + **typologies maçonnerie** (mots-clés : maçonnerie, parpaing, pierre, enduit, jointoiement, linteau, fondation, dallage, chaînage…).
6. `lib/transcription.ts` → `PROMPT_METIER_WHISPER` **vocabulaire maçon** (matériaux, marques, mesures) ; `lib/prompts.ts` (rapport) + prompt `quote-proposer` → **style** du maçon (descriptions courtes, concrètes, normes/DTU maçonnerie).
7. `lib/atg.ts` (si porté) → profil (nom, métier « maçonnerie », entreprise) ; `DEPLOYMENT_NAME` / `lib/notify.ts`.
8. Remplacer les libellés « ATG » génériques (constantes, en-têtes) par MTC37.

---

## 6. Couche IA & cohérence

- **Centraliser le modèle** comme ATG (`lib/anthropic.ts` : `MODELE_CLAUDE = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'` + `MODEL_CHAIN` repli auto). MTC37 a déjà la logique de repli dans `lib/openai.ts` (mal nommé). **Option propre** : renommer `lib/openai.ts` → `lib/anthropic.ts` et mettre à jour les imports, **sans changer le code**. Sinon, garder tel quel.
- **Transcription** : porter/aligner `lib/transcription.ts` (Whisper `whisper-large-v3-turbo`, temp 0, prompt métier, + reponctuation Claude avec **garde-fou de fidélité** : squelette alphanumérique + verrou des chiffres ; retombe sur le brut si un mot/mesure est altéré).
- **Type rapport** : vérifier que `generate-report` + `prompts` côté MTC37 produisent un `RapportContenu` compatible avec `ReportView` (déjà le cas — ne pas régresser).
- **Modèles** : par défaut **`claude-sonnet-4-6`** (le plus récent dispo : famille Claude 4.x ; ne pas redescendre). Le canari `model-health` couvre le retrait de modèle (déjà en place).

---

## 7. Variables d'environnement (récap complet)

**Universelles (déjà chez MTC37 pour la plupart) :**
```
ANTHROPIC_API_KEY=…            ANTHROPIC_MODEL=claude-sonnet-4-6
GROQ_API_KEY=…
NEXT_PUBLIC_SUPABASE_URL=…     NEXT_PUBLIC_SUPABASE_ANON_KEY=…     SUPABASE_SERVICE_ROLE_KEY=…
TELEGRAM_BOT_TOKEN=…           TELEGRAM_CHAT_ID=…        DEPLOYMENT_NAME="MTC37 — <nom>"
CRON_SECRET=…                  NEXT_PUBLIC_SITE_URL=https://visite-technique-mtc37.vercel.app
ALERT_WEBHOOK_URL=…            (optionnel)
```
**Devis (Phase 3) :**
```
COSTRUCTOR_API_KEY=…           (clé d'écriture du compte cible)
COSTRUCTOR_API_KEY_OLIVIER=…   (clé de LECTURE du compte source si on copie des modèles ; sinon non requis)
COSTRUCTOR_API_BASE_URL=https://api.costructor.co/external/v1
ATG_COSTRUCTOR_CIBLE=test      (puis le compte MTC37 à la bascule)
```
**À préserver MTC37 :** pCloud (token/email stockés en base dans `profiles.pcloud_*`, pas en env).

> ⚠️ `NEXT_PUBLIC_SITE_URL` doit être défini **sur Vercel** (sinon les liens `/r/[id]` gravés dans les devis cassent).

---

## 8. Ordre d'exécution & check-list « ne rien casser »

**Séquence :**
1. **Phase 1 — Branding/UX** : `tailwind.config.ts` → `globals.css` → `ToastProvider` → `LogoLink` → headers (bannière noire + retour + `?` placeholder désactivé) → favicon/PWA/manifest → `lib/statut-affaire.ts` + `StatusBadge` + onglets + `ChantierCard` (corbeille/appui long) → app-shell. **`npm run build` vert.**
2. **Phase 2 — Tickets** (migrations `010`+`012` → routes `tickets/*` + `telegram-webhook` → libs `ticket-*` → `AssistantTicket` + `VocalRecorderOgg` + worker opus → setup webhook). Puis **assistant** (libs `assistant/**` + `AssistantDevis`/`AssistantGate` + route), domaine CR actif, devis/clients en repli.
3. **Phase 3 — Devis** : migrations `devis` + `bibliotheque_costructor` (+ RLS par user) → bucket `rapports` + `/r/[id]` → `lib/costructor*.ts` → moteurs + routing + enrichissement → front `devis/**` + `api/devis/**` → cascade suppression → **contenu maçonnerie** (biblio, modèles, prompts, mots-clés) → activer pleinement l'assistant.

**Check-list de non-régression (à vérifier après CHAQUE phase) :**
- ✅ pCloud : connexion + upload rapport fonctionnels.
- ✅ Auth multi-user : login, RLS, `UserMenu`, déconnexion OK.
- ✅ Monitoring : cron, Telegram, Sentry, model-health, usage-digest intacts.
- ✅ Parcours visite → rapport → PDF inchangé.
- ✅ `npm run build` vert, pas d'erreurs TypeScript.

---

## 9. Vérification (comment tester)

- **Build** : `npm run build` vert à chaque phase.
- **Phase 1** : parcours visuel sur téléphone — bannière noire `#1A1A1A`, favicon MTC37, 3 onglets, **boutons aux mêmes positions qu'ATG** (retour haut-gauche, `?`/menu haut-droite, CTA vert en bas), PWA installable « Sur l'écran d'accueil ».
- **Phase 2** : ouvrir le `?` → écrire/dicter une demande → **reçue sur Telegram** (chat MTC37) → y répondre → la réponse **apparaît in-app** avec badge non-lus → marquer résolu. Assistant : poser une question sur un **compte rendu existant** → réponse correcte **sans aucun chiffre inventé** (anti-hallucination).
- **Phase 3** : visite maçonnerie fictive → CR → « Préparer mon devis » → moteur **PLAT** au minimum → ajuster métrés (manuel + dictée) → **pousser sur le compte test Costructor MTC37** → vérifier structure groupée + TVA ligne par ligne + idempotence (re-push remplace) → lien court `/r/[id]` ouvre le PDF → supprimer le chantier nettoie devis + PDF (jamais Costructor).

---

## Annexe A — Fichiers ATG « source de vérité » (à copier/adapter)

**Branding/UX** : `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/LogoLink.tsx`, `components/StatusBadge.tsx`, `lib/statut-affaire.ts`, `components/ChantierCard.tsx`, `app/chantiers/chantiers-list.tsx`, `components/ToastProvider.tsx`, `public/*`.
**Tickets** : `components/AssistantTicket.tsx`, `components/VocalRecorderOgg.tsx`, `app/api/tickets/{route,[id]/route,[id]/messages/route,[id]/resolu/route,lu/route}.ts`, `app/api/telegram-webhook/route.ts`, `lib/ticket-classifier.ts`, `lib/ticket-categories.ts`, `lib/ticket-telegram.ts`, `lib/notify.ts`, `supabase/migrations/010_tickets.sql`, `012_ticket_threads.sql`, `scripts/setup-telegram-webhook.mts`.
**Assistant** : `lib/assistant/{aiguilleur,orchestrateur,domaine-clients,domaine-comptes-rendus,domaine-recap,rediger,historique,matching-nom}.ts`, `lib/devis-historique.ts`, `components/AssistantDevis.tsx`, `components/AssistantGate.tsx`, `app/api/assistant-devis/route.ts`.
**Devis/Costructor** : `lib/quote-proposer.ts`, `lib/atg-devis-structure.ts`, `lib/atg-devis-modele.ts`, `lib/atg-routing.ts`, `lib/enrichir-devis.ts`, `lib/devis-sections-ordre.ts`, `lib/costructor.ts`, `lib/costructor-compte.ts`, `lib/devis-idempotence.ts`, `app/chantiers/[id]/devis/**`, `app/api/devis/**`, `app/r/[chantierId]/route.ts`, `supabase/migrations/{002_atg_consolidation,005_devis_moteur_clonage}.sql`.
**IA** : `lib/anthropic.ts`, `lib/transcription.ts`, `lib/prompts.ts`, `lib/rapport-pdf.ts`.

## Annexe B — Fichiers MTC37 à PRÉSERVER impérativement

`lib/pcloud.ts` · `app/api/auth/pcloud/connect/route.ts` · `app/api/auth/pcloud/disconnect/route.ts` · `app/api/pcloud/upload-rapport/route.ts` · colonnes `profiles.pcloud_auth_token` / `profiles.pcloud_email` · `components/UserMenu.tsx` · `middleware.ts` + `lib/supabase/middleware.ts` (auth multi-user + RLS) · toute la stack monitoring déjà en place (`lib/monitoring.ts`, `lib/usage.ts`, `lib/notify.ts`, `instrumentation*.ts`, `sentry.*`, `app/api/{cron,keep-alive,model-health,usage-digest,client-error}`).

---

*Document généré par audit source croisé ATG ⇄ MTC37 — base commune `assistant-visite` (Next.js 14 + Supabase). Cible : SaaS « Système 30 Secondes » custom à ~80 %, bases (système 30 s, IA, disposition/logique des boutons, branding, assistant, tickets) identiques d'un artisan à l'autre.*
