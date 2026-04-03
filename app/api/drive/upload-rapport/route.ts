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

    // Sauvegarder les nouveaux tokens après refresh automatique
    oauth2Client.on('tokens', async (tokens) => {
      const updateData: Record<string, string | null> = {};
      if (tokens.access_token) updateData.google_access_token = tokens.access_token;
      if (tokens.expiry_date) updateData.google_token_expiry = new Date(tokens.expiry_date).toISOString();
      if (Object.keys(updateData).length > 0) {
        await supabase.from('profiles').update(updateData).eq('id', user.id);
      }
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // ===== ÉTAPE 1 — Chercher le dossier existant =====
    const searchResponse = await drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFolders = searchResponse.data.files;
    let folderId: string | null = null;

    // ===== ÉTAPE 2 — Utiliser ou créer le dossier =====
    if (existingFolders && existingFolders.length > 0 && existingFolders[0].id) {
      folderId = existingFolders[0].id;
      console.log('[Drive] Dossier existant trouvé:', folderId);
    } else {
      const folderResponse = await drive.files.create({
        requestBody: {
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folderResponse.data.id || null;
      console.log('[Drive] Nouveau dossier créé:', folderId);
    }

    // Vérification de sécurité
    if (!folderId) {
      console.error('[Drive] Impossible de créer ou trouver le dossier');
      return NextResponse.json({ error: 'Impossible de créer le dossier Drive' }, { status: 500 });
    }

    // ===== Récupérer le chantier =====
    const { data: chantier } = await supabase
      .from('chantiers')
      .select('client_prenom, client_nom, date_visite')
      .eq('id', chantierId)
      .single();

    if (!chantier) {
      return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
    }

    // ===== Générer le PDF =====
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

    // ===== ÉTAPE 3 — Construire le nom du fichier =====
    const dateFormatted = new Date(chantier.date_visite)
      .toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      .replace(/\//g, '-');

    const fileName = `Rapport-${chantier.client_nom}-${chantier.client_prenom}-${dateFormatted}.pdf`
      .replace(/\s+/g, '-');

    // ===== ÉTAPE 4 — Uploader le PDF DANS le dossier =====
    console.log('[Drive] Upload vers dossier:', folderId, '| Fichier:', fileName);

    const uploadResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [folderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(pdfBuffer),
      },
      fields: 'id, webViewLink, name',
    });

    console.log('[Drive] Fichier créé:', uploadResponse.data.name, '| ID:', uploadResponse.data.id);

    // ===== ÉTAPE 5 — Retourner le lien =====
    return NextResponse.json({
      success: true,
      fileName: uploadResponse.data.name,
      webViewLink: uploadResponse.data.webViewLink,
      folderId,
    });
  } catch (error) {
    console.error('[Drive] Erreur upload:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi vers Google Drive' },
      { status: 500 }
    );
  }
}
