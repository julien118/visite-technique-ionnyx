import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateReport } from '@/lib/openai';
import { reportError } from '@/lib/monitoring';

// Génération IA (Claude, jusqu'à 32k tokens de sortie + éventuelle bascule de
// modèle) : dépasse largement le timeout serverless Vercel par défaut (10s).
// 120 s (et plus 60) : à ~68 tok/s mesurés, une grosse visite (3000-5000
// tokens de sortie) prend 44-74 s — le mur des 60 s était atteignable. La
// réponse est désormais un flux SSE, la connexion n'est jamais muette.
// NB : si le plan Vercel refuse 120 au déploiement, redescendre à 60.
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { chantierId } = await request.json();

    if (!chantierId) {
      return NextResponse.json({ error: 'chantierId manquant' }, { status: 400 });
    }

    // Client SESSION (anon + RLS) : le middleware exclut /api, donc l'auth se fait
    // ICI. La RLS garantit que l'utilisateur ne génère un rapport QUE pour ses
    // propres chantiers (fini le service-role qui bypassait toute isolation).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Récupérer le chantier et les éléments captés EN PARALLÈLE : les deux
    // requêtes sont indépendantes, et chaque aller-retour Supabase coûte cher
    // depuis la région des fonctions (RLS filtre chacune côté base).
    const [
      { data: chantier, error: chantierError },
      { data: items, error: itemsError },
    ] = await Promise.all([
      supabase.from('chantiers').select('*').eq('id', chantierId).single(),
      supabase
        .from('capture_items')
        .select('*')
        .eq('chantier_id', chantierId)
        .order('position', { ascending: true }),
    ]);

    if (chantierError || !chantier) {
      return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
    }

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

    // Réponse en flux SSE : la progression RÉELLE part vers le client pendant
    // que Claude génère (fini le silence de 30-120 s avec animation fictive).
    // L'événement `fini` ne livre le rapport qu'une fois les écritures DB
    // terminées — le client ne l'affiche jamais avant qu'il soit persisté,
    // exactement comme l'ancienne réponse JSON.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const envoyer = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          envoyer({ type: 'depart' });

          // Générer le rapport via Claude — progression throttlée (~4/s max).
          let dernierEnvoi = 0;
          const rapportContenu = await generateReport(chantier, items, (caracteres) => {
            const maintenant = Date.now();
            if (maintenant - dernierEnvoi >= 250) {
              dernierEnvoi = maintenant;
              envoyer({ type: 'progression', caracteres });
            }
          });

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

          // Écritures finales EN PARALLÈLE : stats (best-effort, la table
          // generation_logs peut ne pas exister — supabase-js ne throw pas,
          // l'erreur est ignorée comme avant), rapport et statut sont
          // indépendants. L'upsert remplace l'ancien select + update/insert
          // (2 allers-retours → 1) : l'index unique idx_rapports_chantier_id
          // garantit un seul rapport par chantier, et contenu_html/pdf_url sont
          // remis à null comme avant pour invalider un PDF précédent.
          await Promise.all([
            supabase.from('generation_logs').insert({
              chantier_id: chantierId,
              nb_photos_envoyees: nbPhotosEnvoyees,
              nb_photos_dans_rapport: nbPhotosDansRapport,
              nb_vocaux_envoyes: nbVocauxEnvoyes,
              nb_photos_manquantes: missingPhotos.length,
              statut: missingPhotos.length === 0 ? 'ok' : 'photos_ajoutees',
            }),
            supabase.from('rapports').upsert(
              {
                chantier_id: chantierId,
                contenu_json: rapportContenu,
                contenu_html: null,
                pdf_url: null,
              },
              { onConflict: 'chantier_id' }
            ),
            supabase
              .from('chantiers')
              .update({ statut: 'rapport_genere' })
              .eq('id', chantierId),
          ]);

          envoyer({ type: 'fini', rapport: rapportContenu });
        } catch (error) {
          console.error('Erreur génération rapport:', error);
          await reportError('Génération de rapport', error);
          envoyer({ type: 'erreur', message: 'Erreur lors de la génération du rapport' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    console.error('Erreur génération rapport:', error);
    await reportError('Génération de rapport', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du rapport' },
      { status: 500 }
    );
  }
}
