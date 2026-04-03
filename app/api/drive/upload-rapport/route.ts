import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_NAME = 'Assistant de Visite - Compte-rendu';

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

    // Vérifier l'utilisateur
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Récupérer les tokens Google depuis le profil
    const { data: profile } = await supabase
      .from('profiles')
      .select('google_access_token, google_refresh_token, google_token_expiry')
      .eq('id', user.id)
      .single();

    if (!profile?.google_refresh_token) {
      return NextResponse.json({ error: 'Google Drive non connecté' }, { status: 403 });
    }

    // Configurer le client OAuth
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: profile.google_access_token,
      refresh_token: profile.google_refresh_token,
    });

    // Listener pour sauvegarder les nouveaux tokens après refresh
    oauth2Client.on('tokens', async (tokens) => {
      const updateData: Record<string, string | null> = {};
      if (tokens.access_token) updateData.google_access_token = tokens.access_token;
      if (tokens.expiry_date) updateData.google_token_expiry = new Date(tokens.expiry_date).toISOString();
      if (Object.keys(updateData).length > 0) {
        await supabase.from('profiles').update(updateData).eq('id', user.id);
      }
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Trouver ou créer le dossier
    const folderRes = await drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    let folderId: string;

    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folder.data.id!;
    }

    // 2. Récupérer le chantier + rapport pour construire le PDF
    const { data: chantier } = await supabase
      .from('chantiers')
      .select('client_prenom, client_nom, date_visite')
      .eq('id', chantierId)
      .single();

    if (!chantier) {
      return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
    }

    // Générer le PDF via la route existante (fetch interne)
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

    // 3. Construire le nom du fichier
    const dateVisite = new Date(chantier.date_visite);
    const dd = String(dateVisite.getDate()).padStart(2, '0');
    const mm = String(dateVisite.getMonth() + 1).padStart(2, '0');
    const yyyy = dateVisite.getFullYear();
    const fileName = `Rapport-${chantier.client_nom}-${chantier.client_prenom}-${dd}-${mm}-${yyyy}.pdf`
      .replace(/\s+/g, '-');

    // 4. Uploader le PDF dans le dossier
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [folderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(pdfBuffer),
      },
      fields: 'id, webViewLink',
    });

    return NextResponse.json({
      success: true,
      fileId: file.data.id,
      webViewLink: file.data.webViewLink,
      fileName,
    });
  } catch (error) {
    console.error('Erreur upload Drive:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi vers Google Drive' },
      { status: 500 }
    );
  }
}
