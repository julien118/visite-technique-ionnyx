// =============================================================
// POST /api/devis/metres-vocaux
// =============================================================
// Saisie des métrés À LA VOIX : audio → transcription Groq → Claude assigne les
// quantités aux postes existants (parserMetresVocal) → persiste sections + totaux.
// MULTI-USER (session + RLS). Body multipart : { devisId, audio, sections }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'
import { parserMetresVocal } from '@/lib/devis/metres'
import { calculerTotalHT, calculerTotalTTC } from '@/lib/devis/totaux'
import type { SectionDevis } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// Transcription via Groq Whisper (même config que /api/transcribe).
async function transcrire(audio: Blob): Promise<string> {
  const fd = new FormData()
  fd.append('file', audio, 'metres.webm')
  fd.append('model', 'whisper-large-v3-turbo')
  fd.append('language', 'fr')
  fd.append('response_format', 'json')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: fd,
  })
  if (!res.ok) throw new Error(`Transcription ${res.status}`)
  const j = (await res.json()) as { text?: string }
  return j.text ?? ''
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const form = await request.formData()
    const devisId = form.get('devisId')
    const audio = form.get('audio')
    const sectionsRaw = form.get('sections')
    if (typeof devisId !== 'string') return NextResponse.json({ error: 'devisId manquant' }, { status: 400 })
    if (!(audio instanceof Blob)) return NextResponse.json({ error: 'audio manquant' }, { status: 400 })

    let sections: SectionDevis[] = []
    if (typeof sectionsRaw === 'string') {
      try {
        const p = JSON.parse(sectionsRaw)
        if (Array.isArray(p)) sections = p as SectionDevis[]
      } catch {
        /* ignore */
      }
    }

    const transcription = await transcrire(audio)
    console.log('[metres-vocaux] transcription:', JSON.stringify(transcription))
    const majSections = await parserMetresVocal(transcription, sections)

    // Persistance + totaux (on préserve la TVA et un statut déjà poussé).
    const { data: actuel } = await supabase
      .from('devis')
      .select('statut, tva_taux')
      .eq('id', devisId)
      .eq('user_id', user.id)
      .maybeSingle()
    const tva = (actuel?.tva_taux as number | null) ?? 10
    const totalHT = calculerTotalHT(majSections)
    const totalTTC = calculerTotalTTC(totalHT, tva)
    const statut =
      actuel?.statut === 'pousse_costructor'
        ? 'pousse_costructor'
        : totalHT > 0
          ? 'metres_en_cours'
          : 'sections_proposees'

    await supabase
      .from('devis')
      .update({ sections_finales: majSections, total_ht: totalHT, total_ttc: totalTTC, statut })
      .eq('id', devisId)
      .eq('user_id', user.id)

    return NextResponse.json({ sections: majSections, transcription })
  } catch (e) {
    console.error('[api/devis/metres-vocaux]', e)
    await reportError('Métrés vocaux', e)
    return NextResponse.json({ error: 'Erreur lors de la saisie vocale' }, { status: 500 })
  }
}
