import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { pcloudUploadFile, pcloudGetFileLink, type PCloudHostname } from '@/lib/pcloud';

// Dossier pCloud de destination — "Mon pCloud/2 ETUDES-DEVIS"
// Surchargeable via env var PCLOUD_FOLDER_ID pour d'autres comptes.
const DEFAULT_FOLDER_ID = 23489690527;

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('pcloud_auth_token, pcloud_hostname')
      .eq('id', user.id)
      .single();

    if (!profile?.pcloud_auth_token) {
      return NextResponse.json({ error: 'pCloud non connecté' }, { status: 403 });
    }

    const hostname: PCloudHostname = (profile.pcloud_hostname as PCloudHostname) || 'eapi.pcloud.com';

    const { data: chantier } = await supabase
      .from('chantiers')
      .select('client_prenom, client_nom, date_visite')
      .eq('id', chantierId)
      .single();

    if (!chantier) {
      return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
    }

    // Générer le PDF via l'API existante
    const pdfResponse = await fetch(new URL('/api/export-pdf', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; '),
      },
      body: JSON.stringify({ chantierId }),
    });

    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'Erreur génération PDF' }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    // Nom du fichier
    const dateFormatted = new Date(chantier.date_visite)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .replace(/\//g, '-');

    const fileName = `Rapport-${chantier.client_nom}-${chantier.client_prenom}-${dateFormatted}.pdf`
      .replace(/\s+/g, '-');

    const folderId = process.env.PCLOUD_FOLDER_ID
      ? parseInt(process.env.PCLOUD_FOLDER_ID, 10)
      : DEFAULT_FOLDER_ID;

    const uploadResult = await pcloudUploadFile(
      profile.pcloud_auth_token,
      folderId,
      fileName,
      pdfBuffer,
      hostname
    );

    if (uploadResult.result !== 0) {
      console.error('[pCloud] Upload échoué:', uploadResult);

      // Token expiré → reset côté DB pour forcer reconnexion
      if (uploadResult.result === 1000 || uploadResult.result === 2000) {
        await supabase.from('profiles').update({ pcloud_auth_token: null }).eq('id', user.id);
        return NextResponse.json({ error: 'pCloud non connecté' }, { status: 403 });
      }

      return NextResponse.json(
        { error: uploadResult.error || 'Erreur upload pCloud' },
        { status: 500 }
      );
    }

    const fileId = uploadResult.metadata?.[0]?.fileid || uploadResult.fileids?.[0];
    let publicLink: string | null = null;

    if (fileId) {
      publicLink = await pcloudGetFileLink(profile.pcloud_auth_token, fileId, hostname);
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileId,
      publicLink,
    });
  } catch (error) {
    console.error('[pCloud] Erreur upload:', error);
    await reportError('Envoi pCloud', error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi vers pCloud" },
      { status: 500 }
    );
  }
}
