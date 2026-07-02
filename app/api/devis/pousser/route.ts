// =============================================================
// POST /api/devis/pousser
// =============================================================
// Crée/MAJ le devis dans Costructor — SUR L'ESPACE D'HENDRIX (MTC37) par défaut
// (COSTRUCTOR_CIBLE=hendrix ; 'julien' = bac à sable de test). Lignes LIBRES (sans
// product id), TVA en taux. Idempotent : supprime l'ancien brouillon avant le
// re-push. MULTI-USER (session + RLS). Body : { devisId }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'
import {
  trouverOuCreerContact,
  pousserDevisLignesLibres,
  supprimerDevis,
} from '@/lib/costructor'
import { calculerTotalHT, calculerTotalTTC } from '@/lib/devis/totaux'
import type { Chantier, Devis } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// Nom auto par défaut (cohérent avec le récapitulatif) si Hendrix n'a rien saisi.
function nomAutoDevis(chantier: Chantier): string {
  const client = `${chantier.client_prenom ?? ''} ${chantier.client_nom ?? ''}`.replace(/\s+/g, ' ').trim()
  const base = client ? `Devis maçonnerie — ${client}` : (chantier.objet_travaux ?? '').trim() || 'Devis maçonnerie'
  return base + (chantier.client_adresse ? `, ${chantier.client_adresse}` : '')
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { devisId } = (await request.json().catch(() => ({}))) as { devisId?: string }
    if (!devisId) return NextResponse.json({ error: 'devisId manquant' }, { status: 400 })

    // Devis (RLS) + chantier
    const { data: devisRow, error: errD } = await supabase
      .from('devis')
      .select('*')
      .eq('id', devisId)
      .eq('user_id', user.id)
      .single()
    if (errD || !devisRow) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    const devis = devisRow as Devis

    const { data: chantierRow } = await supabase
      .from('chantiers')
      .select('*')
      .eq('id', devis.chantier_id)
      .single()
    if (!chantierRow) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 })
    const chantier = chantierRow as Chantier

    const sections = devis.sections_finales?.length ? devis.sections_finales : devis.sections_proposees ?? []
    const tva = devis.tva_taux ?? 10
    const totalHT = calculerTotalHT(sections)
    if (totalHT <= 0) {
      return NextResponse.json({ error: 'Saisissez au moins une quantité avant l’envoi.' }, { status: 400 })
    }

    try {
      // Client (sur le compte cible) — recherche ou création.
      const contactId = await trouverOuCreerContact({
        client_nom: chantier.client_nom,
        client_prenom: chantier.client_prenom,
        client_email: chantier.client_email,
        client_telephone: chantier.client_telephone,
        client_adresse: chantier.client_adresse,
      })

      // Idempotence : supprime l'ancien brouillon avant de recréer.
      if (devis.costructor_devis_id) await supprimerDevis(devis.costructor_devis_id)

      const preVisitAt = chantier.date_visite ? chantier.date_visite.slice(0, 10) : undefined
      const nomFinal = devis.nom && devis.nom.trim() ? devis.nom.trim() : nomAutoDevis(chantier)
      const { id: quoteId } = await pousserDevisLignesLibres({
        contactId,
        sections,
        tvaTaux: tva,
        nom: nomFinal,
        description: chantier.objet_travaux || undefined,
        preVisitAt,
      })

      const totalTTC = calculerTotalTTC(totalHT, tva)
      // URL de consultation du brouillon (best-effort ; base surchargeable par env
      // COSTRUCTOR_APP_URL si le domaine réel de l'app Costructor diffère).
      const appBase = (process.env.COSTRUCTOR_APP_URL || 'https://app.costructor.co').replace(/\/$/, '')
      const devisUrl = `${appBase}/quotes/${quoteId}`
      await supabase
        .from('devis')
        .update({
          statut: 'pousse_costructor',
          costructor_devis_id: quoteId,
          costructor_devis_url: devisUrl,
          total_ht: totalHT,
          total_ttc: totalTTC,
          pousse_le: new Date().toISOString(),
          erreur_push: null,
        })
        .eq('id', devisId)
        .eq('user_id', user.id)

      return NextResponse.json({ ok: true, costructor_devis_id: quoteId, costructor_devis_url: devisUrl, total_ht: totalHT, total_ttc: totalTTC })
    } catch (pushErr) {
      // Échec d'écriture Costructor : on marque le devis, on n'efface rien.
      const msg = pushErr instanceof Error ? pushErr.message : 'Échec Costructor'
      await supabase.from('devis').update({ statut: 'echec', erreur_push: msg }).eq('id', devisId).eq('user_id', user.id)
      await reportError('Push devis Costructor', pushErr)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  } catch (e) {
    console.error('[api/devis/pousser]', e)
    await reportError('Push devis', e)
    return NextResponse.json({ error: 'Erreur lors de l’envoi du devis' }, { status: 500 })
  }
}
