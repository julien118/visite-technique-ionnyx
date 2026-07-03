// =============================================================
// Outbox tickets — GARANTIE de livraison Telegram (aucune demande perdue)
// =============================================================
// Contrat : une demande client atterrit TOUJOURS sur Telegram. Si l'envoi immédiat
// échoue (canal momentanément HS, mauvais TELEGRAM_TOPIC_ID, blip réseau après retries),
// la demande N'EST PAS perdue : elle reste en file et est ré-expédiée automatiquement,
//   - de façon opportuniste : à chaque appel de /api/tickets (le widget « ? » poll ~30 s),
//   - de façon garantie      : par le cron quotidien (filet de sécurité absolu).
//
// AUCUNE migration : le projet Supabase de MTC37 n'est pas relié au MCP. On réutilise
// le schéma existant — le marqueur « à livrer » = un message côté demandeur (tout auteur
// SAUF 'julien') SANS telegram_message_id (l'insert pose null quand l'envoi immédiat a
// échoué). Dès qu'une re-livraison réussit, on renseigne le message_id → la ligne sort
// de la file. Le 'julien' exclu = les réponses du support (à ne pas ré-émettre).

import type { SupabaseClient } from '@supabase/supabase-js'
import { livrerTicketTelegram } from './notify'
import { formaterOuverture, formaterRelanceClient, clavierTicket } from './ticket-telegram'
import { reportError } from './monitoring'
import type { TicketContexte } from './types'

// Garde-fous en mémoire (réinitialisés au cold start, ce qui est sans risque : le
// marqueur d'attente est en base) :
//   - `enCours` évite qu'un cron + un GET concurrents doublonnent le même envoi ;
//   - `dernierEssai` espace les retries quand le canal est durablement KO.
const enCours = new Set<string>()
const dernierEssai = new Map<string, number>()
const RETRY_MIN_MS = 30_000

type LigneOutbox = { id: string; ticket_id: string; texte: string; created_at: string }

// (Re)livre UNE demande en attente. Renvoie true si elle a atterri sur Telegram.
async function livrerUne(admin: SupabaseClient, row: LigneOutbox): Promise<boolean> {
  // Ouverture (1er message du fil → avec boutons) ou relance ? On regarde s'il existe
  // un message antérieur dans le même fil.
  const { count } = await admin
    .from('ticket_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', row.ticket_id)
    .lt('created_at', row.created_at)
  const estOuverture = (count ?? 0) === 0

  const { data: ticket } = await admin
    .from('tickets')
    .select('titre, contexte')
    .eq('id', row.ticket_id)
    .maybeSingle()
  const titre = (ticket?.titre as string | null) ?? null
  const contexte = (ticket?.contexte as TicketContexte | null) ?? {}

  let messageId: number | null
  if (estOuverture) {
    messageId = await livrerTicketTelegram(formaterOuverture(titre, row.texte, contexte), {
      clavier: clavierTicket(row.ticket_id),
    })
  } else {
    // Relance : on threade sous le dernier message déjà posté du fil, si dispo.
    const { data: dernier } = await admin
      .from('ticket_messages')
      .select('telegram_message_id')
      .eq('ticket_id', row.ticket_id)
      .not('telegram_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    messageId = await livrerTicketTelegram(formaterRelanceClient(titre, row.texte), {
      replyToMessageId: dernier?.telegram_message_id ?? undefined,
    })
  }

  if (messageId === null) return false
  await admin
    .from('ticket_messages')
    .update({ telegram_message_id: messageId })
    .eq('id', row.id)
  return true
}

/**
 * Draine les demandes clientes NON encore livrées sur Telegram. Best-effort : ne throw
 * jamais, borné par `limite` (le cas courant = 0 en attente → une seule requête indexée).
 * Renvoie le nombre de demandes (re)livrées lors de ce passage.
 */
export async function livrerNotifsEnAttente(admin: SupabaseClient, limite = 5): Promise<number> {
  try {
    // « à livrer » = tout message côté demandeur (client, ou l'ancien 'olivier' hérité
    // d'ATG) SANS telegram_message_id. On exclut donc uniquement les réponses de Julien
    // → un ticket resté bloqué avant le rename 'olivier'→'client' est aussi rattrapé.
    const { data } = await admin
      .from('ticket_messages')
      .select('id, ticket_id, texte, created_at')
      .neq('auteur', 'julien')
      .is('telegram_message_id', null)
      .order('created_at', { ascending: true })
      .limit(limite)
    const lignes = (data ?? []) as LigneOutbox[]
    if (!lignes.length) return 0

    let livrees = 0
    const now = Date.now()
    for (const row of lignes) {
      if (enCours.has(row.id)) continue
      const last = dernierEssai.get(row.id)
      if (last && now - last < RETRY_MIN_MS) continue
      enCours.add(row.id)
      dernierEssai.set(row.id, now)
      try {
        if (await livrerUne(admin, row)) livrees++
      } catch {
        // best-effort : on retentera au prochain passage.
      } finally {
        enCours.delete(row.id)
      }
    }
    return livrees
  } catch (e) {
    await reportError('Outbox tickets — drain', e)
    return 0
  }
}
