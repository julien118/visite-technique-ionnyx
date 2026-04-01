import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { RapportContenu } from '@/lib/types';

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

    // Récupérer le rapport
    const { data: rapport, error } = await supabase
      .from('rapports')
      .select('contenu_json')
      .eq('chantier_id', chantierId)
      .single();

    if (error || !rapport?.contenu_json) {
      return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
    }

    const contenu = rapport.contenu_json as RapportContenu;

    // Générer le HTML du rapport pour conversion PDF côté client
    const html = buildReportHtml(contenu);

    return NextResponse.json({ html });
  } catch (error) {
    console.error('Erreur export PDF:', error);
    return NextResponse.json({ error: 'Erreur export PDF' }, { status: 500 });
  }
}

function buildReportHtml(contenu: RapportContenu): string {
  const client = contenu.client;
  const dateFormatted = new Date(client.date_visite).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  let html = `
    <div style="font-family: Arial, sans-serif; color: #1F2937; max-width: 800px; margin: 0 auto;">
      <div style="background: #1E3A5F; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">RAPPORT DE VISITE</h1>
        <p style="margin: 4px 0 0; opacity: 0.8;">${client.prenom} ${client.nom} — ${dateFormatted}</p>
      </div>

      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px;">
        <h2 style="font-size: 16px; color: #1E3A5F; margin-top: 0;">INFORMATIONS CLIENT</h2>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #6B7280; width: 140px;">Nom</td><td>${client.prenom} ${client.nom}</td></tr>
          <tr><td style="padding: 4px 0; color: #6B7280;">Adresse</td><td>${client.adresse}</td></tr>
          ${client.telephone ? `<tr><td style="padding: 4px 0; color: #6B7280;">Téléphone</td><td>${client.telephone}</td></tr>` : ''}
          ${client.email ? `<tr><td style="padding: 4px 0; color: #6B7280;">Email</td><td>${client.email}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #6B7280;">Date de visite</td><td>${dateFormatted}</td></tr>
          ${client.provenance ? `<tr><td style="padding: 4px 0; color: #6B7280;">Provenance</td><td>${client.provenance}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #6B7280;">Type</td><td>${client.type_chantier === 'sous_traitance' ? 'Sous-traitance' : 'Direct client'}</td></tr>
        </table>
      </div>`;

  contenu.observations.forEach((obs, index) => {
    html += `
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px;">
        <h2 style="font-size: 16px; color: #1E3A5F; margin-top: 0;">OBSERVATION ${index + 1} — ${obs.titre}</h2>
        <p style="font-size: 14px; line-height: 1.6;">${obs.description}</p>
        ${obs.photos.length > 0 ? `
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
            ${obs.photos.map(p => `<img src="${p.url}" alt="${p.legende}" style="width: 200px; height: 150px; object-fit: cover; border-radius: 4px;" />`).join('')}
          </div>
        ` : ''}
        ${obs.points_vigilance.length > 0 ? `
          <div style="margin-top: 12px; padding: 12px; background: #FEF3C7; border-radius: 6px;">
            <p style="font-size: 13px; font-weight: bold; color: #92400E; margin: 0 0 4px;">Points de vigilance</p>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #92400E;">
              ${obs.points_vigilance.map(pv => `<li>${pv}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>`;
  });

  if (contenu.acces_chantier) {
    html += `
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px;">
        <h2 style="font-size: 16px; color: #1E3A5F; margin-top: 0;">ACCÈS CHANTIER</h2>
        <p style="font-size: 14px;">${contenu.acces_chantier}</p>
      </div>`;
  }

  if (contenu.duree_estimee) {
    html += `
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px;">
        <h2 style="font-size: 16px; color: #1E3A5F; margin-top: 0;">DURÉE ESTIMÉE</h2>
        <p style="font-size: 14px;">${contenu.duree_estimee}</p>
      </div>`;
  }

  if (contenu.notes) {
    html += `
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <h2 style="font-size: 16px; color: #1E3A5F; margin-top: 0;">NOTES</h2>
        <p style="font-size: 14px;">${contenu.notes}</p>
      </div>`;
  }

  html += `</div>`;
  return html;
}
