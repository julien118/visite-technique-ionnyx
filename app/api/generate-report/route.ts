import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateReport } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { chantierId } = await request.json();

    if (!chantierId) {
      return NextResponse.json({ error: 'chantierId manquant' }, { status: 400 });
    }

    // Client Supabase avec le service role pour accéder aux données
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    // Récupérer le chantier
    const { data: chantier, error: chantierError } = await supabase
      .from('chantiers')
      .select('*')
      .eq('id', chantierId)
      .single();

    if (chantierError || !chantier) {
      return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
    }

    // Récupérer les éléments captés triés par position
    const { data: items, error: itemsError } = await supabase
      .from('capture_items')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('position', { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: 'Erreur récupération des éléments' }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Aucun élément capté pour ce chantier' }, { status: 400 });
    }

    // Appeler GPT-4.1 pour générer le rapport structuré
    const rapportContenu = await generateReport(chantier, items);

    // Sauvegarder ou mettre à jour le rapport en BDD
    const { data: existingRapport } = await supabase
      .from('rapports')
      .select('id')
      .eq('chantier_id', chantierId)
      .single();

    if (existingRapport) {
      // Mise à jour (régénération)
      await supabase
        .from('rapports')
        .update({
          contenu_json: rapportContenu,
          contenu_html: null,
          pdf_url: null,
        })
        .eq('id', existingRapport.id);
    } else {
      // Création
      await supabase
        .from('rapports')
        .insert({
          chantier_id: chantierId,
          contenu_json: rapportContenu,
        });
    }

    // Mettre à jour le statut du chantier
    await supabase
      .from('chantiers')
      .update({ statut: 'rapport_genere' })
      .eq('id', chantierId);

    return NextResponse.json({ rapport: rapportContenu });
  } catch (error) {
    console.error('Erreur génération rapport:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du rapport' },
      { status: 500 }
    );
  }
}
