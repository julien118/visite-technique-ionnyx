import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // Récupérer les capture_items pour nettoyer le Storage
  const { data: items } = await supabase
    .from('capture_items')
    .select('type, audio_url, photo_url')
    .eq('chantier_id', id);

  // Supprimer les fichiers du Storage
  if (items && items.length > 0) {
    const audioFiles: string[] = [];
    const photoFiles: string[] = [];

    for (const item of items) {
      if (item.type === 'vocal' && item.audio_url) {
        // Extraire le path relatif depuis l'URL Supabase
        const match = item.audio_url.match(/\/storage\/v1\/object\/(?:public|sign)\/audio\/(.+)/);
        if (match) audioFiles.push(match[1]);
      }
      if (item.type === 'photo' && item.photo_url) {
        const match = item.photo_url.match(/\/storage\/v1\/object\/(?:public|sign)\/photos\/(.+)/);
        if (match) photoFiles.push(match[1]);
      }
    }

    if (audioFiles.length > 0) {
      await supabase.storage.from('audio').remove(audioFiles);
    }
    if (photoFiles.length > 0) {
      await supabase.storage.from('photos').remove(photoFiles);
    }
  }

  // Supprimer le chantier (cascade sur capture_items et rapports via FK)
  // RLS garantit qu'on ne peut supprimer que ses propres chantiers
  const { error } = await supabase
    .from('chantiers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erreur suppression chantier:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
