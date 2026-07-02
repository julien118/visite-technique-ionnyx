// =============================================================
// GET /api/devis/articles
// =============================================================
// Renvoie la bibliothèque d'ouvrages d'Hendrix (LECTURE SEULE) pour
// l'autocomplétion « Remplacer / Ajouter un article » de l'éditeur.
// MULTI-USER (session requise).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listerArticlesBibliotheque } from '@/lib/costructor'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    // On ne renvoie que les champs utiles à l'autocomplétion (payload léger).
    const articles = (await listerArticlesBibliotheque()).map((a) => ({
      costructor_article_id: a.costructor_article_id,
      libelle: a.libelle,
      unite: a.unite,
      prix_vente: a.prix_vente,
    }))
    return NextResponse.json({ articles })
  } catch (e) {
    console.error('[api/devis/articles]', e)
    await reportError('Articles devis', e)
    return NextResponse.json({ error: 'Bibliothèque indisponible' }, { status: 500 })
  }
}
