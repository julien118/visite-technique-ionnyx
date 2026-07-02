// =============================================================
// Formatage des messages Telegram d'un fil de discussion (tickets)
// =============================================================
// Centralise la mise en forme HTML (échappée) des notifications envoyées à Julien :
// ouverture d'une demande + relances du client dans le fil. Réutilisé par les
// routes /api/tickets et /api/tickets/[id]/messages.

import { echapperHtml, nomDeploiement, nomContact, type ClavierInline } from './notify'
import type { TicketContexte } from './types'

const fmtHorodatage = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function appareilDepuisUA(ua?: string): string | null {
  if (!ua) return null
  if (/iphone/i.test(ua)) return 'iPhone'
  if (/ipad/i.test(ua)) return 'iPad'
  if (/android/i.test(ua)) return 'Android'
  if (/mac os x/i.test(ua)) return 'Mac'
  if (/windows/i.test(ua)) return 'Windows'
  return null
}

const FOOTER = '↩️ Pour répondre à Hendrix : « réponds » à ce message. Boutons ci-dessous 👇'

// Clavier inline sous une demande NON encore prise : qui s'en occupe / clôture.
// callback_data ≤ 64 octets : « prendre:<uuid> » = 44 octets.
export function clavierTicket(ticketId: string): ClavierInline {
  return {
    inline_keyboard: [[
      { text: '🙋 Je prends', callback_data: `prendre:${ticketId}` },
      { text: '✅ Résolu', callback_data: `resolu:${ticketId}` },
    ]],
  }
}

// Clavier après qu'un fil a été pris : montre QUI traite (visible par tous dans le
// groupe) + permet de reprendre la main (Lotfi reprend) et de clôturer.
export function clavierTicketPris(ticketId: string, prenom: string): ClavierInline {
  return {
    inline_keyboard: [[
      { text: `🔵 Pris par ${prenom}`, callback_data: `prendre:${ticketId}` },
      { text: '✅ Résolu', callback_data: `resolu:${ticketId}` },
    ]],
  }
}

// Notification d'OUVERTURE d'une demande (1er message du fil).
export function formaterOuverture(
  titre: string | null,
  message: string,
  contexte: TicketContexte,
): string {
  const sujet = titre?.trim() ? ` — <i>${echapperHtml(titre.trim())}</i>` : ''
  const lignes = [
    `💬 <b>${echapperHtml(nomContact())}</b> · ${echapperHtml(nomDeploiement())}${sujet}`,
    echapperHtml(message),
    '',
  ]
  if (contexte.path) lignes.push(`📍 Page : ${echapperHtml(contexte.path)}`)
  if (contexte.chantierLabel) lignes.push(`🏗️ Chantier : ${echapperHtml(contexte.chantierLabel)}`)
  const meta = [appareilDepuisUA(contexte.userAgent), contexte.viewport].filter(Boolean).join(' · ')
  if (meta) lignes.push(`📱 ${echapperHtml(meta)}`)
  lignes.push(`🕐 ${fmtHorodatage.format(new Date())}`)
  lignes.push('')
  lignes.push(FOOTER)
  return lignes.join('\n')
}

// Relance du CLIENT dans un fil existant.
export function formaterRelanceClient(titre: string | null, message: string): string {
  const sujet = titre?.trim() ? ` — <i>${echapperHtml(titre.trim())}</i>` : ''
  return [
    `💬 <b>${echapperHtml(nomContact())} — relance</b>${sujet}`,
    echapperHtml(message),
    '',
    FOOTER,
  ].join('\n')
}
