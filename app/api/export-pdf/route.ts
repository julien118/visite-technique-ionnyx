import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { RapportContenu } from '@/lib/types';
import jsPDF from 'jspdf';

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

    // Récupérer le chantier pour le nom du fichier
    const { data: chantier } = await supabase
      .from('chantiers')
      .select('client_prenom, client_nom, date_visite')
      .eq('id', chantierId)
      .single();

    const contenu = rapport.contenu_json as RapportContenu;
    const pdfBuffer = await buildPdf(contenu);

    const dateStr = chantier?.date_visite
      ? new Date(chantier.date_visite).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const fileName = `rapport-visite-${chantier?.client_prenom || ''}-${chantier?.client_nom || ''}-${dateStr}.pdf`
      .replace(/\s+/g, '-');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Erreur export PDF:', error);
    return NextResponse.json({ error: 'Erreur export PDF' }, { status: 500 });
  }
}

// Strip markdown bold for PDF text
function stripBold(text: string): { text: string; boldRanges: { start: number; end: number }[] } {
  const boldRanges: { start: number; end: number }[] = [];
  let clean = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        const start = clean.length;
        const boldText = text.slice(i + 2, end);
        clean += boldText;
        boldRanges.push({ start, end: clean.length });
        i = end + 2;
        continue;
      }
    }
    clean += text[i];
    i++;
  }
  return { text: clean, boldRanges };
}

interface FetchedImage {
  dataUri: string;
  width: number;
  height: number;
}

async function fetchImageAsBase64(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${contentType};base64,${base64}`;

    // Extraire les dimensions depuis les données JPEG/PNG
    const uint8 = new Uint8Array(buffer);
    const dims = getImageDimensions(uint8);

    return { dataUri, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

// Extraire largeur/hauteur d'un JPEG ou PNG depuis les octets bruts
function getImageDimensions(data: Uint8Array): { width: number; height: number } {
  // PNG : octets 16-23 contiennent largeur (4 octets) et hauteur (4 octets)
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
    const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
    return { width, height };
  }

  // JPEG : chercher le marqueur SOF (0xFFC0, 0xFFC1, 0xFFC2)
  if (data[0] === 0xFF && data[1] === 0xD8) {
    let offset = 2;
    while (offset < data.length - 8) {
      if (data[offset] !== 0xFF) { offset++; continue; }
      const marker = data[offset + 1];
      if (marker >= 0xC0 && marker <= 0xC3) {
        const height = (data[offset + 5] << 8) | data[offset + 6];
        const width = (data[offset + 7] << 8) | data[offset + 8];
        return { width, height };
      }
      const segmentLength = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + segmentLength;
    }
  }

  // Fallback : ratio 4:3 paysage
  return { width: 1920, height: 1440 };
}

async function buildPdf(contenu: RapportContenu): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginH = 18; // marges horizontales (~48px)
  const marginV = 15; // marge verticale haute
  const contentWidth = pageWidth - marginH * 2;
  const bottomLimit = pageHeight - 18; // marge basse
  let y = marginV;

  // Line heights
  const LH_DESC = 5;    // ~1.6 line-height pour texte 9pt
  const LH_PV = 4.8;    // ~1.5 line-height pour points de vigilance

  function checkPage(needed: number) {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = marginV;
    }
  }

  // ===== HEADER =====
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RAPPORT DE VISITE', marginH, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const client = contenu.client;
  const dateFormatted = new Date(client.date_visite).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  doc.text(`${client.prenom} ${client.nom} — ${dateFormatted}`, marginH, 23);
  y = 40;

  // ===== INFOS CLIENT =====
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMATIONS CLIENT', marginH, y);
  y += 8;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const clientRows = [
    ['Nom', `${client.prenom} ${client.nom}`],
    ['Adresse', client.adresse],
    ...(client.telephone ? [['Téléphone', client.telephone]] : []),
    ...(client.email ? [['Email', client.email]] : []),
    ['Date de visite', dateFormatted],
    ...(client.provenance ? [['Provenance', client.provenance]] : []),
    ['Type', client.type_chantier === 'sous_traitance' ? 'Sous-traitance' : 'Direct client'],
  ];

  for (const [label, value] of clientRows) {
    checkPage(6);
    doc.setTextColor(150, 150, 150);
    doc.text(label, marginH, y);
    doc.setTextColor(60, 60, 60);
    doc.text(value, marginH + 35, y);
    y += 5.5;
  }
  y += 6;

  // ===== OBSERVATIONS =====
  for (let i = 0; i < contenu.observations.length; i++) {
    const obs = contenu.observations[i];

    // Espacement entre observations (10mm ~ 28px)
    if (i > 0) {
      y += 10;
    }

    // Ligne de séparation
    checkPage(25);
    doc.setDrawColor(220, 220, 220);
    doc.line(marginH, y, pageWidth - marginH, y);
    y += 8;

    // Titre observation — ne jamais séparer du texte descriptif
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(`OBSERVATION ${i + 1} — ${obs.titre}`, contentWidth);
    const titleHeight = titleLines.length * 5.5;
    // Vérifier que titre + au moins 2 lignes de description tiennent ensemble
    checkPage(titleHeight + 14);
    doc.text(titleLines, marginH, y);
    y += titleHeight + 4; // 10px margin-bottom après titre

    // Description — line-height 1.6
    const { text: descClean } = stripBold(obs.description);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(descClean, contentWidth);
    for (const line of descLines) {
      checkPage(LH_DESC + 1);
      doc.text(line, marginH, y);
      y += LH_DESC;
    }
    y += 5;

    // Photos intégrées
    for (const photo of obs.photos) {
      const imgResult = await fetchImageAsBase64(photo.url);
      if (imgResult) {
        try {
          // max 85% largeur, max ~108mm hauteur (~380px à 72dpi ≈ 108mm à 25.4mm/in)
          const maxImgWidth = contentWidth * 0.85;
          const maxImgHeight = 100;
          const ratio = imgResult.width / imgResult.height;

          let imgWidth = maxImgWidth;
          let imgHeight = imgWidth / ratio;

          if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight;
            imgWidth = imgHeight * ratio;
          }
          if (imgWidth > maxImgWidth) {
            imgWidth = maxImgWidth;
            imgHeight = imgWidth / ratio;
          }

          // Centrer horizontalement
          const imgX = marginH + (contentWidth - imgWidth) / 2;

          // Estimer la hauteur totale photo + légende pour ne pas couper
          const legendHeight = photo.legende ? 12 : 0;
          checkPage(imgHeight + legendHeight + 12);

          y += 5; // margin-top 16px ≈ 5mm
          doc.addImage(imgResult.dataUri, 'JPEG', imgX, y, imgWidth, imgHeight);
          y += imgHeight;

          // Légende — margin-top 3mm (~8px), centrée, italic, gris
          if (photo.legende) {
            y += 3;
            const { text: legendClean } = stripBold(photo.legende);
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128); // #6B7280
            doc.setFont('helvetica', 'italic');
            const legendLines = doc.splitTextToSize(legendClean, contentWidth);
            for (const line of legendLines) {
              checkPage(4);
              doc.text(line, pageWidth / 2, y, { align: 'center' });
              y += 3.8;
            }
            doc.setFont('helvetica', 'normal');
          }
          y += 7; // margin-bottom 20px ≈ 7mm
        } catch {
          // Skip image on error
        }
      }
    }

    // Points de vigilance — margin-top 6mm, padding 12px 16px
    if (obs.points_vigilance.length > 0) {
      y += 6;
      const pvPadH = 5; // ~16px horizontal
      const pvPadV = 4; // ~12px vertical
      const pvLineCount = obs.points_vigilance.length;
      const pvHeight = pvLineCount * LH_PV + pvPadV * 2 + 5;

      checkPage(pvHeight + 2);
      doc.setFillColor(236, 253, 245);
      doc.roundedRect(marginH, y, contentWidth, pvHeight, 2, 2, 'F');
      y += pvPadV;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text('Points de vigilance', marginH + pvPadH, y + 1);
      y += 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      for (const pv of obs.points_vigilance) {
        const { text: pvClean } = stripBold(pv);
        doc.text(`•  ${pvClean}`, marginH + pvPadH, y);
        y += LH_PV;
      }
      y += pvPadV;
      y += 8; // margin-bottom 24px ≈ 8mm
    }
  }

  // ===== Accès chantier =====
  if (contenu.acces_chantier) {
    y += 8;
    checkPage(20);
    doc.setDrawColor(220, 220, 220);
    doc.line(marginH, y, pageWidth - marginH, y);
    y += 8;
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ACCÈS CHANTIER', marginH, y);
    y += 7;
    const { text: accesClean } = stripBold(contenu.acces_chantier);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const accesLines = doc.splitTextToSize(accesClean, contentWidth);
    for (const line of accesLines) {
      checkPage(LH_DESC + 1);
      doc.text(line, marginH, y);
      y += LH_DESC;
    }
    y += 6;
  }

  // ===== Durée estimée =====
  if (contenu.duree_estimee) {
    checkPage(18);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DURÉE ESTIMÉE', marginH, y);
    y += 7;
    const { text: dureeClean } = stripBold(contenu.duree_estimee);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(dureeClean, marginH, y);
    y += 10;
  }

  // ===== Notes =====
  if (contenu.notes) {
    checkPage(18);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', marginH, y);
    y += 7;
    const { text: notesClean } = stripBold(contenu.notes);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notesClean, contentWidth);
    for (const line of notesLines) {
      checkPage(LH_DESC + 1);
      doc.text(line, marginH, y);
      y += LH_DESC;
    }
  }

  // ===== FOOTER =====
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      'Rapport généré par IONNYX — Assistant de Visite IA',
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
