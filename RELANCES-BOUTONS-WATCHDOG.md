# Boutons Telegram · Backlog · Relances · Watchdog — mise en route

> Ajouté en Session 6. Tout est codé ; il reste **3 actions manuelles** (migration, env, cron externe).
> Objectif : aucune demande d'Hendrix ne passe à la trappe + fini le double-traitement Julien/Lotfi.

## Ce qui a été ajouté (rappel des bricks)

1. **Boutons inline** sous chaque demande : `🙋 Je prends` / `✅ Résolu`. Tap « Je prends » →
   le bouton devient `🔵 Pris par X` (visible par tous) → l'autre sait. `/resolu` tapé marche toujours (secours).
2. **Backlog** : toute demande classée *bug* ou *amélioration* est versée auto dans le backlog
   (`tickets.backlog_statut = 'nouveau'`). Vue SQL `public.backlog`. Résumé dans le digest.
3. **Relances** : `/api/relances` relance les fils ouverts, **non pris**, sans réponse depuis > 2h,
   uniquement **8h→20h** (heure de Paris). Throttle 2h par fil. La relance porte aussi les boutons.
4. **Watchdog (zéro demande perdue)**, dans la même route :
   - **A** — notif Telegram ratée (message_id null) → re-notification auto + patch du fil.
   - **B** — `getWebhookInfo` : si Telegram n'arrive plus à livrer (erreurs / file engorgée) → alerte.
   - **Sonde de vie** : le cron externe qui appelle la route détecte aussi si l'app est down (non-200).
5. **Digest enrichi** : section `🎫 Support` (nb demandes, ventilation bugs/idées/questions,
   résolues vs en attente, backlog restant).

## Action 1 — Migration Supabase

Exécuter `supabase/migrations/008_tickets_assignation_backlog.sql` dans le **SQL Editor du bon projet**
(⚠️ pas via MCP — le MCP Supabase ne pointe pas sur le projet MTC37). Idempotent, ré-exécutable sans risque.

## Action 2 — Variable d'environnement

Ajouter `RELANCES_SECRET` (chaîne aléatoire longue) :
- en local : `.env.local`
- en prod : Vercel → Settings → Environment Variables (puis redeploy)

Elle protège `/api/relances` (sinon la route refuse l'appel si la variable existe ; si absente, route ouverte).

## Action 3 — Cron externe (toutes les heures)

Vercel Hobby = 1 cron/jour max → on utilise un cron **externe gratuit** (cron-job.org ou UptimeRobot) :

- **URL** : `https://visite-technique-mtc37.vercel.app/api/relances?key=LE_SECRET`
- **Méthode** : GET
- **Fréquence** : toutes les heures (la route ignore elle-même 20h→8h, et throttle les relances à 2h)
- **Alerte du service** : activer la notification « si la réponse n'est pas 200 » → c'est la **sonde de vie**
  externe (si Vercel/app down, vous êtes prévenus indépendamment du système).

> La fenêtre horaire et l'anti-spam sont gérés DANS la route → un simple appel horaire suffit, pas besoin
> de configurer des plages côté cron.

## Note Telegram

Les boutons (`callback_query`) sont reçus par défaut par le webhook. Si un jour `setWebhook` a été appelé
avec `allowed_updates` restreint à `["message"]`, il faut le relancer en incluant `"callback_query"`
(ou sans `allowed_updates` = tout sauf `chat_member`).
