import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';

// Retrouve le chemin storage à partir de la valeur stockée en base, qui peut être :
//  - un CHEMIN brut (nouveau format audio : "userId/chantierId/xxx.webm"),
//  - une URL Supabase publique/signée (photos + anciens audios :
//    ".../object/(public|sign)/<bucket>/<path>?token=..."). Le [^?]+ tronque le
//    éventuel "?token=..." (sinon l'ancien nettoyage d'audio échouait silencieusement).
function storagePath(value: string, bucket: string): string | null {
  const m = value.match(new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`));
  if (m) return decodeURIComponent(m[1]);
  if (!value.includes('://')) return value.replace(/^\/+/, '');
  return null;
}

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
        const p = storagePath(item.audio_url, 'audio');
        if (p) audioFiles.push(p);
      }
      if (item.type === 'photo' && item.photo_url) {
        const p = storagePath(item.photo_url, 'photos');
        if (p) photoFiles.push(p);
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
    await reportError('Suppression de chantier', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
