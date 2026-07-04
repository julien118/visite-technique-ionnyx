import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createClient } from '@/lib/supabase/server';
import { RapportContenu } from '@/lib/types';
import { nomDeploiement } from '@/lib/notify';
import jsPDF from 'jspdf';

// La construction jsPDF est instantanée ; le temps part dans les fetches
// d'images. 60 s = large marge, aligné sur les autres routes.
export const maxDuration = 60;

// Slug de nom de fichier : « Jérôme Lechat » → « jerome-lechat » (sans accents ni
// caractères spéciaux), pour un nom de PDF propre et personnalisé à la ATG.
function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===== Assainissement du texte pour jsPDF =====
// Les polices standard de jsPDF (helvetica) n'encodent que WinAnsi (latin-1 +
// quelques signes typographiques). UN SEUL caractère hors de ce jeu (ex. « ≈ »
// généré par l'IA) fait basculer TOUTE la ligne en encodage 16 bits : texte
// espacé lettre à lettre qui déborde de la page. On remplace donc les
// caractères connus par un équivalent lisible, et on retire les autres.
// Codes Unicode -> equivalent ASCII (codes numeriques : pas de caracteres
// invisibles dans la source). Les espaces Unicode (insecable fine U+202F,
// etc.) sont couvertes par le repli NFKD plus bas (elles se decomposent en
// espace simple).
const REMPLACEMENTS_PDF = new Map<number, string>([
  [0x2248, '~'],   // approximativement egal (celui qui cassait les legendes)
  [0x2260, '!='],  // different
  [0x2264, '<='],  // inferieur ou egal
  [0x2265, '>='],  // superieur ou egal
  [0x2212, '-'],   // signe moins mathematique
  [0x2192, '->'],  // fleche droite
  [0x2190, '<-'],  // fleche gauche
  [0x2032, "'"],   // prime (minutes)
  [0x2033, '"'],   // double prime (secondes)
  [0x2044, '/'],   // barre de fraction
]);
// WinAnsi = latin-1 + ces caractères de la plage 0x80-0x9F (€ ‘ ’ “ ” • – — … œ Œ ™ etc.)
const WINANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function pdfSafe(texte: string): string {
  let sortie = '';
  for (const c of texte) {
    const code = c.codePointAt(0)!;
    if (code <= 0xff || WINANSI_EXTRAS.includes(c)) {
      sortie += c;
    } else if (REMPLACEMENTS_PDF.has(code)) {
      sortie += REMPLACEMENTS_PDF.get(code)!;
    } else {
      // Dernier recours : décomposer (é composé, ligatures…) et garder la
      // partie latin-1 ; sinon le caractère est retiré plutôt que de casser
      // l'encodage de toute la ligne.
      const decompose = c.normalize('NFKD');
      for (const d of decompose) {
        if (d.codePointAt(0)! <= 0xff) sortie += d;
      }
    }
  }
  return sortie;
}

// Applique pdfSafe à toutes les chaînes d'un objet (le contenu du rapport tel
// qu'il sort de l'IA). Ne touche que le RENDU PDF — la DB reste intacte.
function assainirPourPdf<T>(valeur: T): T {
  if (typeof valeur === 'string') return pdfSafe(valeur) as T;
  if (Array.isArray(valeur)) return valeur.map(assainirPourPdf) as T;
  if (valeur && typeof valeur === 'object') {
    const copie: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeur)) copie[k] = assainirPourPdf(v);
    return copie as T;
  }
  return valeur;
}

export async function POST(request: NextRequest) {
  try {
    const { chantierId } = await request.json();

    if (!chantierId) {
      return NextResponse.json({ error: 'chantierId manquant' }, { status: 400 });
    }

    // Client SESSION (anon + RLS) : le middleware exclut /api, donc l'auth se fait
    // ICI. La RLS garantit qu'on n'exporte QUE le rapport d'un chantier appartenant
    // à l'utilisateur (fini le service-role qui bypassait toute isolation → PII).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Récupérer le rapport (RLS : ne renvoie la ligne que si le chantier lié
    // appartient à l'utilisateur courant — sinon 0 ligne → 404 plus bas).
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

    // Assainissement pour l'encodage WinAnsi de jsPDF (un « ≈ » de l'IA
    // cassait des lignes entières en texte espacé qui débordait de la page).
    const contenu = assainirPourPdf(rapport.contenu_json as RapportContenu);
    // On passe l'origine de la requête pour charger le logo depuis /public (asset
    // servi par le même déploiement — marche en local comme sur Vercel).
    const pdfBuffer = await buildPdf(contenu, request.nextUrl.origin);

    const dateStr = chantier?.date_visite
      ? new Date(chantier.date_visite).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const nomClient = `${chantier?.client_prenom || ''} ${chantier?.client_nom || ''}`.trim();
    const fileName = `compte-rendu-${slugify(nomClient) || 'client'}-${dateStr}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Erreur export PDF:', error);
    await reportError('Export PDF', error);
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

async function fetchImageAsBase64(
  url: string,
  headers?: Record<string, string>
): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, headers ? { headers } : undefined);
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

// Photo via l'optimiseur d'images du déploiement : JPEG redimensionné 1200 px
// (~150-250 Ko au lieu des 0,6-2 Mo stockés — largement suffisant pour un A4).
// `Accept: image/jpeg` force un JPEG (jamais de webp, que jsPDF ne lit pas).
// Repli sur l'original si l'optimiseur échoue.
async function fetchPhotoOptimisee(url: string, origin: string): Promise<FetchedImage | null> {
  const optimisee = `${origin}/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`;
  const via = await fetchImageAsBase64(optimisee, { Accept: 'image/jpeg' });
  if (via && via.dataUri.startsWith('data:image/jpeg')) return via;
  return fetchImageAsBase64(url);
}

async function buildPdf(contenu: RapportContenu, origin: string): Promise<Buffer> {
  // Toutes les images partent EN PARALLÈLE (logo + photos redimensionnées) au
  // lieu d'un fetch séquentiel par photo au fil de la mise en page. Avec les
  // originaux, le PDF pesait ~8 Mo (au-delà de la limite de réponse Vercel de
  // 4,5 Mo) et mettait des minutes à arriver ; le voilà autour de ~1 Mo.
  const urlsPhotos = contenu.observations.flatMap((o) => o.photos.map((p) => p.url));
  const [logo, ...photosChargees] = await Promise.all([
    fetchImageAsBase64(`${origin}/logo-mtc37.png`),
    ...urlsPhotos.map((u) => fetchPhotoOptimisee(u, origin)),
  ]);
  const imagesParUrl = new Map<string, FetchedImage | null>();
  urlsPhotos.forEach((u, i) => imagesParUrl.set(u, photosChargees[i]));

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

  // ===== HEADER (parité ATG : bande noire, logo MTC37 à gauche, titre + date à droite) =====
  const client = contenu.client;
  const dateFormatted = new Date(client.date_visite).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const bandH = 34;
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageWidth, bandH, 'F');

  // Logo MTC37 (blanc, fond transparent → pensé pour la bande noire), préchargé
  // ci-dessus. Repli texte sur le nom de l'entreprise si l'asset est indisponible.
  let logoOk = false;
  if (logo && logo.width > 0) {
    try {
      const logoW = 32;
      const logoH = logoW * (logo.height / logo.width);
      doc.addImage(logo.dataUri, 'PNG', marginH, (bandH - logoH) / 2, logoW, logoH);
      logoOk = true;
    } catch {
      // PNG non pris en charge / erreur de décodage : on bascule sur le repli texte.
    }
  }
  if (!logoOk) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(nomDeploiement(), marginH, 20);
  }

  // Titre + date de visite, alignés à droite (comme ATG).
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('RAPPORT DE VISITE', pageWidth - marginH, 15, { align: 'right' });
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(dateFormatted, pageWidth - marginH, 22, { align: 'right' });

  y = bandH + 8;

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

    // Photos intégrées (préchargées en parallèle en tête de fonction)
    for (const photo of obs.photos) {
      const imgResult = imagesParUrl.get(photo.url) ?? null;
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

  // Pas de mention en bas de page (retirée à la demande d'Hendrix).

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
