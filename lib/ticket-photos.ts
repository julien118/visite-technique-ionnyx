// =============================================================
// Upload des photos de tickets dans le bucket public `photos`
// =============================================================
// Réutilisé par les routes (photo jointe par Hendrix) et le webhook (photo
// envoyée par Julien depuis Telegram). Stockage service-role (ignore la RLS
// storage). Best-effort : renvoie l'URL publique, ou null en cas d'échec.

import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'

const BUCKET = 'photos'

export async function uploadTicketPhoto(file: Blob, ticketId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const type = file.type || 'image/jpeg'
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = `tickets/${ticketId}/${randomUUID()}.${ext}`
    const buf = new Uint8Array(await file.arrayBuffer())
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: type,
      upsert: false,
    })
    if (error) {
      console.error('[ticket-photos] upload:', error.message)
      return null
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch (e) {
    console.error('[ticket-photos] upload exception:', e)
    return null
  }
}
