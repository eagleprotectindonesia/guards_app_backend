import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { FetchedPhoto } from './fetch-photos';

const TZ = 'Asia/Makassar';
const TZ_LABEL = 'WITA';

export type ReportMetadata = {
  reportNumber: string | null;
  status: string;
  guardName: string;
  employeeNumber: string;
  clientName: string | null;
  siteName: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  photoCount: number;
};

function formatTZ(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${TZ_LABEL}`;
}

function formatDateOnlyTZ(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number, contentWidth: number): void {
  const savedY = doc.y;
  doc.fontSize(8).font('Helvetica').fillColor('#888888');
  doc.text(
    `Generated: ${formatTZ(new Date())} | Page ${pageNumber}`,
    doc.page.margins.left,
    doc.page.height - 30,
    { align: 'center', width: contentWidth, lineBreak: false, height: 12 },
  );
  doc.fillColor('#000000');
  doc.y = savedY;
}

function resolveLogoPath(): string {
  const candidates = [
    // dev (tsx): __dirname = src/lib/shift-photo-report
    path.resolve(__dirname, '../assets/eagle-logo.png'),
    // production (esbuild): __dirname = dist/
    path.resolve(__dirname, '../src/lib/assets/eagle-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const LOGO_PATH = resolveLogoPath();

async function getLogoBuffer(): Promise<Buffer | null> {
  if (fs.existsSync(LOGO_PATH)) {
    try {
      return fs.readFileSync(LOGO_PATH);
    } catch {
      console.warn('[ShiftPhotoReport] Failed to read logo PNG:', LOGO_PATH);
    }
  } else {
    console.warn('[ShiftPhotoReport] Logo file not found at:', LOGO_PATH);
  }

  return null;
}

export async function generatePdf(metadata: ReportMetadata, photos: FetchedPhoto[]): Promise<Buffer> {
  const logoBuffer = await getLogoBuffer();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Guard Shift Photo Report - ${metadata.guardName}`,
        Author: 'EP ERP System',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentWidth = pageWidth;
    const centerX = doc.page.margins.left + contentWidth / 2;

    let pageNumber = 0;

    // ── Cover Page ──
    pageNumber = 1;

    // Header band
    doc.save();
    doc.rect(0, 0, doc.page.width, 145).fill('#f5f5f5');
    doc.restore();

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, centerX - 100, 37, { fit: [200, 60], align: 'center' });
      } catch {
        console.warn('[ShiftPhotoReport] Failed to render logo, skipping.');
      }
    }

    let yCursor = 170;

    doc.fontSize(22).font('Helvetica-Bold');
    doc.text('Guard Shift Photo Report', doc.page.margins.left, yCursor, { align: 'center', width: contentWidth });
    yCursor = doc.y + 8;

    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    if (metadata.reportNumber) {
      doc.text(`Report ID: ${metadata.reportNumber}`, doc.page.margins.left, yCursor, { align: 'center', width: contentWidth });
      yCursor = doc.y + 4;
    }
    doc.text(`Report Date: ${formatDateOnlyTZ(metadata.shiftStartsAt)}`, doc.page.margins.left, yCursor, { align: 'center', width: contentWidth });
    yCursor = doc.y + 18;
    doc.fillColor('#000000');

    // Divider
    doc.moveTo(doc.page.margins.left, yCursor)
      .lineTo(doc.page.margins.left + contentWidth, yCursor)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
    yCursor += 30;

    // Info card
    const cardX = doc.page.margins.left;
    const cardTop = yCursor;
    const cardH = 200;

    doc.save();
    doc.fillColor('#fafafa').strokeColor('#e0e0e0').lineWidth(0.5);
    doc.roundedRect(cardX, cardTop, contentWidth, cardH, 4).fillAndStroke();
    doc.restore();

    yCursor = cardTop + 15;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Shift Information', doc.page.margins.left + 15, yCursor);
    yCursor += 22;
    doc.fillColor('#000000');

    const infoLines: [string, string][] = [
      ['Guard Name:', metadata.guardName],
      ['Employee No:', metadata.employeeNumber],
      ['Client Name:', metadata.clientName || '-'],
      ['Site Name:', metadata.siteName],
      ['Shift Start:', formatTZ(metadata.shiftStartsAt)],
      ['Shift End:', formatTZ(metadata.shiftEndsAt)],
      ['Photos Collected:', String(metadata.photoCount)],
      ['Status:', metadata.status.charAt(0).toUpperCase() + metadata.status.slice(1)],
    ];

    const labelX = doc.page.margins.left + 15;
    const valueX = doc.page.margins.left + 130;
    const labelW = 110;
    const valueW = contentWidth - 145;

    doc.fontSize(10);
    for (const [label, value] of infoLines) {
      doc.font('Helvetica-Bold').fillColor('#333333');
      doc.text(label, labelX, yCursor, { width: labelW });
      doc.font('Helvetica').fillColor('#000000');
      doc.text(value, valueX, yCursor, { width: valueW });
      yCursor = Math.max(doc.y, yCursor + 18) + 2;
    }

    // Summary footer
    yCursor = cardTop + cardH + 20;
    doc.moveTo(doc.page.margins.left, yCursor)
      .lineTo(doc.page.margins.left + contentWidth, yCursor)
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();
    yCursor += 14;

    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666666');
    doc.text(
      `This report contains ${metadata.photoCount} photo(s) submitted during the shift.`,
      doc.page.margins.left,
      yCursor,
      { align: 'center', width: contentWidth },
    );
    doc.fillColor('#000000');

    drawFooter(doc, pageNumber, contentWidth);

    // ── Photo Pages ──
    if (photos.length === 0) {
      doc.addPage();
      pageNumber++;
      doc.fontSize(16).font('Helvetica-Bold');
      doc.text('No photo evidence submitted during this shift.', doc.page.margins.left, doc.page.height / 2 - 20, { align: 'center', width: contentWidth });
      drawFooter(doc, pageNumber, contentWidth);
    } else {
      for (const photo of photos) {
        doc.addPage();
        pageNumber++;

        const maxImageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 80;

        try {
          doc.image(photo.buffer, doc.page.margins.left, doc.page.margins.top, {
            fit: [contentWidth, maxImageH],
            align: 'center',
          });
        } catch (err) {
          console.warn(`[ShiftPhotoReport] Failed to embed image ${photo.s3Key}:`, err);
          doc.fontSize(12).font('Helvetica').text('[Image not available]', doc.page.margins.left, doc.page.margins.top);
        }

        const captionY = doc.page.height - doc.page.margins.bottom - 60;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(
          `Guard: ${metadata.guardName}  |  Employee No: ${metadata.employeeNumber}  |  Site: ${metadata.siteName}`,
          doc.page.margins.left,
          captionY,
          { width: contentWidth },
        );
        doc.fontSize(9).font('Helvetica');
        doc.text(`Date & Time: ${formatTZ(photo.createdAt)}`, doc.page.margins.left, doc.y + 2);

        drawFooter(doc, pageNumber, contentWidth);
      }
    }

    doc.end();
  });
}

export function generateReportFileName(guardName: string, employeeNumber: string, date: Date): string {
  const dateStr = formatDateOnlyTZ(date);
  const safeName = guardName.replace(/[^a-zA-Z0-9]/g, '_');
  return `shift-report_${safeName}_${employeeNumber}_${dateStr}.pdf`;
}
