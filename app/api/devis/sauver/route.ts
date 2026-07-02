// =============================================================
// POST /api/devis/sauver
// =============================================================
// Auto-save des éditions du devis (sections éditées, métrés, taux de TVA) +
// recalcul des totaux (CODE, jamais l'IA). MULTI-USER (session + RLS).
// Body : { devisId, sections, tva_taux? }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'
import { calculerTotalHT, calculerTotalTTC } from '@/lib/devis/totaux'
import type { SectionDevis } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { devisId, sections, tva_taux } = (await request.json().catch(() => ({}))) as {
      devisId?: string
      sections?: SectionDevis[]
      tva_taux?: number
    }
    if (!devisId || !Array.isArray(sections)) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Statut + TVA courants (pour ne pas rétrograder un devis poussé ni écraser la TVA).
    const { data: actuel } = await supabase
      .from('devis')
      .select('statut, tva_taux')
      .eq('id', devisId)
      .eq('user_id', user.id)
      .maybeSingle()
    const statutActuel = actuel?.statut as string | undefined
    // TVA : celle fournie sinon on préserve l'existante (défaut 10).
    const taux =
      typeof tva_taux === 'number' && tva_taux >= 0
        ? Math.min(100, tva_taux)
        : ((actuel?.tva_taux as number | null) ?? 10)
    const totalHT = calculerTotalHT(sections)
    const totalTTC = calculerTotalTTC(totalHT, taux)
    const aMetre = sections.some((s) => s.articles.some((a) => a.quantite != null && a.quantite > 0))
    const nouveauStatut =
      statutActuel === 'pousse_costructor'
        ? 'pousse_costructor'
        : aMetre
          ? 'metres_en_cours'
          : 'sections_proposees'

    const { error } = await supabase
      .from('devis')
      .update({
        sections_finales: sections,
        tva_taux: taux,
        total_ht: totalHT,
        total_ttc: totalTTC,
        statut: nouveauStatut,
      })
      .eq('id', devisId)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true, total_ht: totalHT, total_ttc: totalTTC })
  } catch (e) {
    console.error('[api/devis/sauver]', e)
    await reportError('Sauvegarde devis', e)
    return NextResponse.json({ error: 'Erreur de sauvegarde' }, { status: 500 })
  }
}
