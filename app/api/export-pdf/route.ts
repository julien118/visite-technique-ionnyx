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
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = margin;
    }
  }

  // ===== HEADER =====
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RAPPORT DE VISITE', margin, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const client = contenu.client;
  const dateFormatted = new Date(client.date_visite).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  doc.text(`${client.prenom} ${client.nom} — ${dateFormatted}`, margin, 22);
  y = 38;

  // ===== INFOS CLIENT =====
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMATIONS CLIENT', margin, y);
  y += 7;

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
    checkPage(5);
    doc.setTextColor(150, 150, 150);
    doc.text(label, margin, y);
    doc.setTextColor(60, 60, 60);
    doc.text(value, margin + 35, y);
    y += 5;
  }
  y += 5;

  // ===== OBSERVATIONS =====
  for (let i = 0; i < contenu.observations.length; i++) {
    const obs = contenu.observations[i];
    checkPage(20);

    // Ligne de séparation
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Titre observation
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(`OBSERVATION ${i + 1} — ${obs.titre}`, contentWidth);
    checkPage(titleLines.length * 5 + 5);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5 + 3;

    // Description
    const { text: descClean } = stripBold(obs.description);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(descClean, contentWidth);
    for (const line of descLines) {
      checkPage(5);
      doc.text(line, margin, y);
      y += 4.5;
    }
    y += 3;

    // Photos intégrées
    for (const photo of obs.photos) {
      const imgResult = await fetchImageAsBase64(photo.url);
      if (imgResult) {
        try {
          // Calculer les dimensions proportionnelles
          const maxImgWidth = contentWidth * 0.8; // 80% de la largeur pour centrer
          const maxImgHeight = 90; // mm max
          const ratio = imgResult.width / imgResult.height;

          let imgWidth = maxImgWidth;
          let imgHeight = imgWidth / ratio;

          // Si trop haut, réduire par la hauteur
          if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight;
            imgWidth = imgHeight * ratio;
          }

          // Si plus large que le max, réduire par la largeur
          if (imgWidth > maxImgWidth) {
            imgWidth = maxImgWidth;
            imgHeight = imgWidth / ratio;
          }

          // Centrer horizontalement
          const imgX = margin + (contentWidth - imgWidth) / 2;

          checkPage(imgHeight + 10);
          doc.addImage(imgResult.dataUri, 'JPEG', imgX, y, imgWidth, imgHeight);
          y += imgHeight + 2;

          if (photo.legende) {
            const { text: legendClean } = stripBold(photo.legende);
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            const legendLines = doc.splitTextToSize(legendClean, contentWidth);
            for (const line of legendLines) {
              checkPage(4);
              doc.text(line, margin, y);
              y += 3.5;
            }
          }
          y += 4;
        } catch {
          // Skip image on error
        }
      }
    }

    // Points de vigilance
    if (obs.points_vigilance.length > 0) {
      checkPage(10);
      doc.setFillColor(236, 253, 245);
      const pvHeight = obs.points_vigilance.length * 4.5 + 10;
      doc.roundedRect(margin, y, contentWidth, pvHeight, 2, 2, 'F');
      y += 5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text('Points de vigilance', margin + 3, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      for (const pv of obs.points_vigilance) {
        const { text: pvClean } = stripBold(pv);
        checkPage(5);
        doc.text(`• ${pvClean}`, margin + 3, y);
        y += 4.5;
      }
      y += 3;
    }
  }

  // ===== Accès chantier =====
  if (contenu.acces_chantier) {
    checkPage(15);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ACCÈS CHANTIER', margin, y);
    y += 6;
    const { text: accesClean } = stripBold(contenu.acces_chantier);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const accesLines = doc.splitTextToSize(accesClean, contentWidth);
    for (const line of accesLines) {
      checkPage(5);
      doc.text(line, margin, y);
      y += 4.5;
    }
    y += 5;
  }

  // ===== Durée estimée =====
  if (contenu.duree_estimee) {
    checkPage(15);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DURÉE ESTIMÉE', margin, y);
    y += 6;
    const { text: dureeClean } = stripBold(contenu.duree_estimee);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(dureeClean, margin, y);
    y += 8;
  }

  // ===== Notes =====
  if (contenu.notes) {
    checkPage(15);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', margin, y);
    y += 6;
    const { text: notesClean } = stripBold(contenu.notes);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notesClean, contentWidth);
    for (const line of notesLines) {
      checkPage(5);
      doc.text(line, margin, y);
      y += 4.5;
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
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
