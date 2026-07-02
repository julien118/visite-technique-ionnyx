// =============================================================
// POST /api/devis/proposer
// =============================================================
// À partir d'un chantier visité : croise le SIGNAL (objet + dictée + observations
// du rapport) avec ses devis passés (« déjà chiffré ») et son catalogue, et propose
// un devis structuré. MULTI-USER (session + RLS). Aucune écriture Costructor ici.
// Body : { chantierId, regenerer? }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'
import {
  chargerIndexReference,
  construireIndexDevisPasses,
  persistIndex,
} from '@/lib/devis/index-devis-passes'
import { choisirDevisReference } from '@/lib/devis/matching'
import { proposerDevis } from '@/lib/devis/proposer'
import { listerArticlesBibliotheque } from '@/lib/costructor'
import type { RapportContenu } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// Observations structurées du rapport → bouts de texte (contexte du chantier).
function observationsDuRapport(contenu: unknown): string[] {
  const c = contenu as RapportContenu | null
  if (!c || !Array.isArray(c.observations)) return []
  const out: string[] = []
  for (const o of c.observations) {
    const bouts = [o.titre, o.description, ...(o.points_vigilance ?? [])].filter(Boolean)
    if (bouts.length > 0) out.push(bouts.join('. '))
  }
  return out
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { chantierId, regenerer } = (await request.json().catch(() => ({}))) as {
      chantierId?: string
      regenerer?: boolean
    }
    if (!chantierId) return NextResponse.json({ error: 'chantierId manquant' }, { status: 400 })

    // Chantier (RLS : doit appartenir au user)
    const { data: chantier, error: errCh } = await supabase
      .from('chantiers')
      .select('id, objet_travaux')
      .eq('id', chantierId)
      .single()
    if (errCh || !chantier) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 })

    // Anti-perte : ne pas réécraser un devis édité / poussé sans demande explicite.
    const { data: existant } = await supabase
      .from('devis')
      .select('id, sections_finales, sections_proposees, statut')
      .eq('chantier_id', chantierId)
      .maybeSingle()
    const dejaTravaille =
      !!existant &&
      (existant.statut === 'pousse_costructor' ||
        (Array.isArray(existant.sections_finales) && existant.sections_finales.length > 0))
    if (existant && !regenerer && dejaTravaille) {
      return NextResponse.json({
        devisId: existant.id,
        sections: existant.sections_finales ?? existant.sections_proposees ?? [],
        reutilise: true,
      })
    }

    // Signal = objet + transcriptions vocales + observations du rapport
    const { data: items } = await supabase
      .from('capture_items')
      .select('transcription, position')
      .eq('chantier_id', chantierId)
      .order('position', { ascending: true })
    const transcriptions = (items ?? [])
      .map((i: { transcription: string | null }) => i.transcription)
      .filter((t: string | null): t is string => !!t && t.trim().length > 0)

    const { data: rapport } = await supabase
      .from('rapports')
      .select('contenu_json')
      .eq('chantier_id', chantierId)
      .maybeSingle()
    const observations = observationsDuRapport(rapport?.contenu_json)

    const signal = [chantier.objet_travaux ?? '', ...transcriptions, ...observations]
      .filter((s) => s && s.trim().length > 0)
      .join('\n')
    if (!signal.trim()) {
      return NextResponse.json(
        { error: 'Aucune observation : faites la visite (et le rapport) avant de préparer le devis.' },
        { status: 400 },
      )
    }

    // Index « déjà chiffré » : lu EN BASE (instantané). Si jamais indexé → 1re
    // construction rapide (parallélisée, cap bas) + persistance pour les fois suivantes.
    let references = await chargerIndexReference()
    if (references.length === 0) {
      references = await construireIndexDevisPasses({ max: 60 })
      persistIndex(references).catch(() => {})
    }
    const choix = choisirDevisReference(signal, references)
    const catalogue = await listerArticlesBibliotheque()
    const sections = await proposerDevis({ signal, references: choix.meilleurs, catalogue })

    // Upsert du devis (statut sections_proposees ; finales = proposées au départ)
    const base = {
      user_id: user.id,
      chantier_id: chantierId,
      statut: 'sections_proposees' as const,
      sections_proposees: sections,
      sections_finales: sections,
      tva_taux: 10,
    }
    let devisId: string | null = null
    if (existant) {
      const resetLien = regenerer
        ? { costructor_devis_id: null, costructor_devis_url: null, pousse_le: null, erreur_push: null }
        : {}
      await supabase
        .from('devis')
        .update({ ...base, ...resetLien })
        .eq('id', existant.id)
      devisId = existant.id
    } else {
      const { data: cree } = await supabase.from('devis').insert(base).select('id').single()
      devisId = cree?.id ?? null
    }

    return NextResponse.json({
      devisId,
      sections,
      modele: choix.meilleur ? { id: choix.meilleur.id, nom: choix.meilleur.nom, score: choix.score } : null,
      ambigu: choix.ambigu,
      nbReferences: references.length,
    })
  } catch (e) {
    console.error('[api/devis/proposer]', e)
    await reportError('Proposition devis', e)
    return NextResponse.json({ error: 'Erreur lors de la préparation du devis' }, { status: 500 })
  }
}
