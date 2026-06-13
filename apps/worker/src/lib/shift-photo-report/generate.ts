import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { FetchedPhoto } from './fetch-photos';

const TZ = 'Asia/Makassar';
const TZ_LABEL = 'WITA';
const LOGO_PATH = path.resolve(__dirname, '../../assets/eagle-protect-logo.png');

export type ReportMetadata = {
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

export function generatePdf(metadata: ReportMetadata, photos: FetchedPhoto[]): Promise<Buffer> {
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

    // ── Cover Page ──
    // Logo
    if (fs.existsSync(LOGO_PATH)) {
      try {
        const logoHeight = 80;
        doc.image(LOGO_PATH, centerX - 60, 80, { width: 120, height: logoHeight });
      } catch {
        console.warn('[ShiftPhotoReport] Failed to render logo, skipping.');
      }
    }

    let yCursor = 200;

    doc.fontSize(24).font('Helvetica-Bold');
    doc.text('Guard Shift Photo Report', centerX, yCursor, { align: 'center' });
    yCursor += 50;

    doc.fontSize(11).font('Helvetica');
    doc.text(`Report Date: ${formatDateOnlyTZ(new Date())}`, centerX, yCursor, { align: 'center' });
    yCursor += 30;

    // Separator
    doc.moveTo(doc.page.margins.left, yCursor)
      .lineTo(doc.page.margins.left + contentWidth, yCursor)
      .strokeColor('#cccccc')
      .stroke();
    yCursor += 30;

    // Shift info
    doc.fontSize(12).font('Helvetica-Bold').text('Shift Information', doc.page.margins.left, yCursor);
    yCursor += 22;

    const infoLines = [
      ['Guard Name:', metadata.guardName],
      ['Employee No:', metadata.employeeNumber],
      ['Client Name:', metadata.clientName || '-'],
      ['Site Name:', metadata.siteName],
      ['Shift Start:', formatTZ(metadata.shiftStartsAt)],
      ['Shift End:', formatTZ(metadata.shiftEndsAt)],
      ['Photos Collected:', String(metadata.photoCount)],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of infoLines) {
      doc.font('Helvetica-Bold').text(label, doc.page.margins.left, yCursor, { continued: true, width: 120 });
      doc.font('Helvetica').text(` ${value}`, { width: contentWidth - 120 });
      yCursor += 16;
    }

    // ── Photo Pages ──
    if (photos.length === 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold');
      doc.text('No photo evidence submitted during this shift.', centerX, doc.page.height / 2 - 20, { align: 'center' });
    } else {
      for (const photo of photos) {
        doc.addPage();

        const maxImageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 80;

        try {
          doc.image(photo.buffer, doc.page.margins.left, doc.page.margins.top, {
            fit: [contentWidth, maxImageH],
            align: 'center',
          });
        } catch (err) {
          console.warn(`[ShiftPhotoReport] Failed to embed image ${photo.s3Key}:`, err);
          doc.fontSize(12).font('Helvetica').text(`[Image not available]`, doc.page.margins.left, doc.page.margins.top);
        }

        const captionY = doc.page.height - doc.page.margins.bottom - 60;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(
          `Guard: ${metadata.guardName}`,
          doc.page.margins.left,
          captionY,
          { continued: true, width: 200 }
        );
        doc.text(
          `  Employee No: ${metadata.employeeNumber}`,
          { continued: true, width: 200 }
        );
        doc.text(
          `  Site: ${metadata.siteName}`,
          { continued: false }
        );
        doc.fontSize(9).font('Helvetica');
        doc.text(`Date & Time: ${formatTZ(photo.createdAt)}`, doc.page.margins.left, captionY + 14);
      }
    }

    // Footer
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text(
        `Generated: ${formatTZ(new Date())} | Page ${i + 1} of ${totalPages}`,
        doc.page.margins.left,
        doc.page.height - 30,
        { align: 'center', width: contentWidth }
      );
      doc.fillColor('#000000');
    }

    doc.end();
  });
}

export function generateReportFileName(guardName: string, employeeNumber: string, date: Date): string {
  const dateStr = formatDateOnlyTZ(date);
  const safeName = guardName.replace(/[^a-zA-Z0-9]/g, '_');
  return `shift-report_${safeName}_${employeeNumber}_${dateStr}.pdf`;
}
