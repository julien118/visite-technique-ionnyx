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

    // Récupérer TOUS les éléments captés triés par position
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

    // Collecter toutes les URLs de photos AVANT la génération
    const allPhotoUrls = new Set<string>();
    for (const item of items) {
      if (item.type === 'photo' && item.photo_url) {
        allPhotoUrls.add(item.photo_url);
      }
    }

    const nbPhotosEnvoyees = allPhotoUrls.size;
    const nbVocauxEnvoyes = items.filter((i: { type: string; transcription: string | null }) => i.type === 'vocal' && i.transcription).length;

    // Générer le rapport via Claude
    const rapportContenu = await generateReport(chantier, items);

    // === AUDIT POST-GÉNÉRATION : vérifier que TOUTES les photos sont présentes ===
    const photosInRapport = new Set<string>();
    for (const obs of rapportContenu.observations) {
      for (const photo of obs.photos) {
        photosInRapport.add(photo.url);
      }
    }

    // Trouver les photos manquantes
    const missingPhotos: string[] = Array.from(allPhotoUrls).filter(
      (url) => !photosInRapport.has(url)
    );

    // Si des photos manquent, les ajouter dans une section dédiée
    if (missingPhotos.length > 0) {
      console.warn(`[generate-report] ${missingPhotos.length} photo(s) manquante(s) sur ${nbPhotosEnvoyees} — ajout en section supplémentaire`);

      rapportContenu.observations.push({
        titre: 'Photos supplémentaires',
        description: `${missingPhotos.length} photo${missingPhotos.length > 1 ? 's' : ''} supplémentaire${missingPhotos.length > 1 ? 's' : ''} prise${missingPhotos.length > 1 ? 's' : ''} pendant la visite.`,
        points_vigilance: [],
        photos: missingPhotos.map((url) => ({
          url,
          legende: 'Photo prise pendant la visite',
        })),
      });
    }

    const nbPhotosDansRapport = photosInRapport.size + missingPhotos.length;

    // Logger les stats de génération
    try {
      await supabase.from('generation_logs').insert({
        chantier_id: chantierId,
        nb_photos_envoyees: nbPhotosEnvoyees,
        nb_photos_dans_rapport: nbPhotosDansRapport,
        nb_vocaux_envoyes: nbVocauxEnvoyes,
        nb_photos_manquantes: missingPhotos.length,
        statut: missingPhotos.length === 0 ? 'ok' : 'photos_ajoutees',
      });
    } catch {
      // La table generation_logs n'existe peut-être pas encore, on continue
    }

    // Sauvegarder ou mettre à jour le rapport en BDD
    const { data: existingRapport } = await supabase
      .from('rapports')
      .select('id')
      .eq('chantier_id', chantierId)
      .single();

    if (existingRapport) {
      await supabase
        .from('rapports')
        .update({
          contenu_json: rapportContenu,
          contenu_html: null,
          pdf_url: null,
        })
        .eq('id', existingRapport.id);
    } else {
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
