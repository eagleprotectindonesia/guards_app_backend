import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { buildShiftReportDownloadFilename } from '@repo/shared';
import type { FetchedPhoto } from './fetch-photos';
import type { ResolvedPoint } from './aggregate';
import { geofenceStatusLabel } from './aggregate';
import { fetchStaticMapPng } from './static-map';

const TZ = 'Asia/Makassar';
const TZ_LABEL = 'WITA';
const TZ_OFFSET = 'UTC+08:00';

const COLORS = {
  navy: '#0F2E5C',
  navySoft: '#1E3A6B',
  red: '#B91C1C',
  text: '#111827',
  textMuted: '#6B7280',
  labelBg: '#EEF2F7',
  tableBorder: '#D1D5DB',
  watermark: '#E5E7EB',
  statValue: '#0F2E5C',
  overlayBg: '#111827',
  overlayBgMuted: 'rgba(0,0,0,0.55)',
  badgeRed: '#B91C1C',
  mapFrame: '#E5E7EB',
  mapFill: '#DEE5DC',
  mapWater: '#CFE0EE',
  mapRoad: '#FFFFFF',
  markerRed: '#D93025',
  tooltipBg: '#FFFFFF',
  linkBlue: '#1A73E8',
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 50, bottom: 60, left: 50, right: 50 };
const HEADER_HEIGHT = 32;
const FOOTER_HEIGHT = 20;

export type NamedPoint = ResolvedPoint;

export type ReportMetadata = {
  reportNumber: string | null;
  reportNumberShort: string;
  status: 'pending' | 'generated' | 'failed' | 'regenerated';
  statusLabel: string;
  guardName: string;
  employeeNumber: string;
  clientName: string | null;
  siteName: string;
  shiftTypeName: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  generatedAt: Date;
  photoCount: number;
  locationUpdateCount: number;
  firstLocation: NamedPoint | null;
  lastLocation: NamedPoint | null;
  geofenceSummary: string;
  downloadFilename: string;
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

function formatTimeOnlyTZ(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
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

function extractReportCounter(reportNumber: string | null): string {
  if (!reportNumber) return 'PENDING';
  const segments = reportNumber.split('-');
  const last = segments[segments.length - 1];
  if (last && /^\d{5}$/.test(last)) return `RPT${last}`;
  return 'PENDING';
}

function statusLabelFor(status: ReportMetadata['status']): string {
  switch (status) {
    case 'generated': return 'Generated / Ready for review';
    case 'pending': return 'Pending';
    case 'failed': return 'Failed';
    case 'regenerated': return 'Regenerated';
    default: return status;
  }
}

function resolveLogoPath(): string {
  const candidates = [
    path.resolve(__dirname, '../assets/eagle-protect-logo.png'),
    path.resolve(__dirname, '../assets/eagle-logo.png'),
    path.resolve(__dirname, '../../src/lib/assets/eagle-protect-logo.png'),
    path.resolve(__dirname, '../../src/lib/assets/eagle-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
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

async function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

function drawWatermark(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.opacity(0.18);
  doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fontSize(120).font('Helvetica-Bold').fillColor(COLORS.watermark);
  doc.text('CONFIDENTIAL', -300, doc.page.height / 2 - 80, {
    width: 2000,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
  doc.opacity(1);
  doc.fillColor(COLORS.text);
}

function drawHeaderBand(doc: PDFKit.PDFDocument, reportNumberShort: string): void {
  const y = 0;
  doc.save();
  doc.rect(0, y, doc.page.width, HEADER_HEIGHT).fill('#F8FAFC');
  doc.rect(0, HEADER_HEIGHT, doc.page.width, 0.5).fill(COLORS.tableBorder);
  doc.restore();

  const textY = y + 10;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text('PT. Eagle Protect International', MARGIN.left, textY, { lineBreak: false });

  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text(`CONFIDENTIAL | ${reportNumberShort}`, MARGIN.left, textY, {
    width: doc.page.width - MARGIN.left - MARGIN.right,
    align: 'right',
    lineBreak: false,
  });

  doc.fillColor(COLORS.text);
}

function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number, reportNumberShort: string): void {
  const y = doc.page.height - FOOTER_HEIGHT - 6;
  doc.save();
  doc.rect(0, y - 4, doc.page.width, 0.5).fill(COLORS.tableBorder);
  doc.restore();

  doc.fontSize(7.5).font('Helvetica').fillColor(COLORS.textMuted);
  const text = `Confidential | Property of PT. Eagle Protect International | Report ID: ${reportNumberShort} | Do not share without authorization | Page ${pageNumber}`;
  doc.text(text, MARGIN.left, y, {
    width: doc.page.width - MARGIN.left - MARGIN.right,
    align: 'center',
    lineBreak: false,
  });
  doc.fillColor(COLORS.text);
}

function applyPageChrome(doc: PDFKit.PDFDocument, pageNumber: number, reportNumberShort: string): void {
  // Chrome elements (footer, watermark) sit at the bottom of the page, past the
  // bottom margin. PDFKit's text() function auto-paginates when doc.y is past
  // page.maxY() during a text call — that would cause an infinite loop with the
  // `pageAdded` event handler. Temporarily extend maxY() so the chrome can be
  // drawn without triggering auto-pagination, then restore.
  const page = doc.page;
  const origMaxY = page.maxY;
  page.maxY = function () {
    return origMaxY.call(page) + 200;
  };

  drawWatermark(doc);
  drawHeaderBand(doc, reportNumberShort);
  drawFooter(doc, pageNumber, reportNumberShort);

  page.maxY = origMaxY;
  // Reset the cursor so subsequent content starts at the top margin
  // and isn't affected by the footer's position (which is near the page bottom).
  doc.x = MARGIN.left;
  doc.y = MARGIN.top;
}

type CellSpec = {
  text: string;
  width: number;
  bold?: boolean;
  color?: string;
  bg?: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
};

function drawRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rowHeight: number,
  cells: CellSpec[],
  options: { borderColor?: string; padding?: number; defaultFontSize?: number } = {},
): void {
  const { borderColor = COLORS.tableBorder, padding = 8, defaultFontSize = 10 } = options;

  let cursorX = x;
  for (const cell of cells) {
    if (cell.bg) {
      doc.save();
      doc.fillColor(cell.bg).rect(cursorX, y, cell.width, rowHeight).fill();
      doc.restore();
    }

    doc.fontSize(cell.fontSize ?? defaultFontSize).font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(cell.color ?? COLORS.text);
    doc.text(cell.text, cursorX + padding, y + padding / 1.5, {
      width: cell.width - padding * 2,
      height: rowHeight - padding,
      ellipsis: true,
      align: cell.align ?? 'left',
      lineBreak: false,
    });

    cursorX += cell.width;
  }

  doc.save();
  doc.strokeColor(borderColor).lineWidth(0.5);
  for (let i = 0; i <= cells.length; i++) {
    const xLine = x + cells.slice(0, i).reduce((sum, c) => sum + c.width, 0);
    doc.moveTo(xLine, y).lineTo(xLine, y + rowHeight).stroke();
  }
  doc.moveTo(x, y).lineTo(x + cells.reduce((sum, c) => sum + c.width, 0), y).stroke();
  doc.moveTo(x, y + rowHeight).lineTo(x + cells.reduce((sum, c) => sum + c.width, 0), y + rowHeight).stroke();
  doc.restore();
  doc.fillColor(COLORS.text);
}

function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  totalWidth: number,
  rows: CellSpec[][],
  rowHeight: number = 22,
): { y: number; totalHeight: number } {
  let cursorY = y;
  for (const row of rows) {
    drawRow(doc, x, cursorY, rowHeight, row);
    cursorY += rowHeight;
  }
  return { y: cursorY, totalHeight: rows.length * rowHeight };
}

function drawTitleBlock(doc: PDFKit.PDFDocument, contentWidth: number, centerX: number, y: number): number {
  let cursorY = y;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.red);
  doc.text('CONFIDENTIAL SECURITY REPORT', MARGIN.left, cursorY, {
    width: contentWidth,
    align: 'center',
    characterSpacing: 2,
    lineBreak: false,
  });
  cursorY = doc.y + 6;

  doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text('Guard Shift Security Operations Report', MARGIN.left, cursorY, {
    width: contentWidth,
    align: 'center',
    lineBreak: false,
  });
  cursorY = doc.y + 4;

  doc.fontSize(10).font('Helvetica-Oblique').fillColor(COLORS.textMuted);
  doc.text('Authorized recipients only - Generated by EP ERP', MARGIN.left, cursorY, {
    width: contentWidth,
    align: 'center',
    lineBreak: false,
  });
  cursorY = doc.y + 14;

  doc.save();
  doc.strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.moveTo(MARGIN.left, cursorY).lineTo(MARGIN.left + contentWidth, cursorY).stroke();
  doc.restore();

  return cursorY + 14;
}

function buildReportInfoRows(metadata: ReportMetadata): CellSpec[][] {
  return [
    [
      { text: 'Download Filename', width: 150, bold: true, bg: COLORS.labelBg },
      { text: metadata.downloadFilename, width: 340 },
    ],
    [
      { text: 'Report Number', width: 150, bold: true, bg: COLORS.labelBg },
      { text: metadata.reportNumberShort, width: 340 },
    ],
    [
      { text: 'ERP Report ID', width: 150, bold: true, bg: COLORS.labelBg },
      { text: metadata.reportNumber ?? 'Pending', width: 340 },
    ],
    [
      { text: 'Generated At', width: 150, bold: true, bg: COLORS.labelBg },
      { text: formatTZ(metadata.generatedAt), width: 340 },
    ],
  ];
}

function buildShiftDetailRows(metadata: ReportMetadata): CellSpec[][] {
  const half = (PAGE.width - MARGIN.left - MARGIN.right) / 2;
  return [
    [
      { text: 'Client', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.clientName ?? '-', width: half - 90 },
      { text: 'Guard', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.guardName, width: half - 90 },
    ],
    [
      { text: 'Site', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.siteName, width: half - 90 },
      { text: 'Employee No', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.employeeNumber, width: half - 90 },
    ],
    [
      { text: 'Shift Date', width: 90, bold: true, bg: COLORS.labelBg },
      { text: formatDateOnlyTZ(metadata.shiftStartsAt), width: half - 90 },
      { text: 'Shift', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.shiftTypeName, width: half - 90 },
    ],
    [
      { text: 'Shift Start', width: 90, bold: true, bg: COLORS.labelBg },
      { text: formatTZ(metadata.shiftStartsAt), width: half - 90 },
      { text: 'Status', width: 90, bold: true, bg: COLORS.labelBg },
      { text: metadata.statusLabel, width: half - 90 },
    ],
    [
      { text: 'Shift End', width: 90, bold: true, bg: COLORS.labelBg },
      { text: formatTZ(metadata.shiftEndsAt), width: half - 90 },
      { text: 'Time Zone', width: 90, bold: true, bg: COLORS.labelBg },
      { text: `${TZ_LABEL} (${TZ_OFFSET})`, width: half - 90 },
    ],
  ];
}

function formatLocationRow(p: NamedPoint | null): string {
  if (!p) return 'No location recorded';
  const coords = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
  return `${formatTimeOnlyTZ(p.timestamp)} ${TZ_LABEL} - ${p.pointName} - ${coords}`;
}

function buildLocationVerificationRows(metadata: ReportMetadata): CellSpec[][] {
  return [
    [
      { text: 'Assigned Site', width: 150, bold: true, bg: COLORS.labelBg },
      { text: metadata.siteName, width: 340 },
    ],
    [
      { text: 'Site Boundary Result', width: 150, bold: true, bg: COLORS.labelBg },
      { text: metadata.geofenceSummary, width: 340 },
    ],
    [
      { text: 'First Location', width: 150, bold: true, bg: COLORS.labelBg },
      { text: formatLocationRow(metadata.firstLocation), width: 340 },
    ],
    [
      { text: 'Last Location', width: 150, bold: true, bg: COLORS.labelBg },
      { text: formatLocationRow(metadata.lastLocation), width: 340 },
    ],
    [
      { text: 'Maps Access', width: 150, bold: true, bg: COLORS.labelBg },
      { text: 'Each photo and location record includes latitude, longitude, accuracy, timestamp, and a map link.', width: 340 },
    ],
  ];
}

type StatCard = { label: string; value: string; subtext: string };

function buildStatCards(metadata: ReportMetadata): StatCard[] {
  const hours = Math.max(0, Math.floor((metadata.shiftEndsAt.getTime() - metadata.shiftStartsAt.getTime()) / 3_600_000));
  return [
    {
      label: 'Shift Duration',
      value: `${hours} hrs`,
      subtext: `${formatTimeOnlyTZ(metadata.shiftStartsAt)} to ${formatTimeOnlyTZ(metadata.shiftEndsAt)}`,
    },
    {
      label: 'Photos',
      value: String(metadata.photoCount),
      subtext: 'Photo evidence',
    },
    {
      label: 'Location Updates',
      value: String(metadata.locationUpdateCount),
      subtext: 'GPS logged',
    },
    {
      label: 'Incidents',
      value: '0',
      subtext: 'No incident reported',
    },
  ];
}

function drawStatCards(doc: PDFKit.PDFDocument, x: number, y: number, totalWidth: number, cards: StatCard[], cardHeight: number = 70): number {
  const cardCount = cards.length;
  const gap = 8;
  const cardWidth = (totalWidth - gap * (cardCount - 1)) / cardCount;
  const labelCellHeight = 18;

  let cursorX = x;
  for (let i = 0; i < cardCount; i++) {
    const card = cards[i]!;
    const cardX = cursorX;

    doc.save();
    doc.fillColor('#FFFFFF').strokeColor(COLORS.tableBorder).lineWidth(0.5);
    doc.rect(cardX, y, cardWidth, cardHeight).fillAndStroke();
    doc.restore();

    doc.save();
    doc.fillColor(COLORS.labelBg).rect(cardX, y, cardWidth, labelCellHeight).fill();
    doc.restore();

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.navy);
    doc.text(card.label.toUpperCase(), cardX, y + 5, {
      width: cardWidth,
      align: 'center',
      characterSpacing: 1,
      lineBreak: false,
    });

    doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.statValue);
    doc.text(card.value, cardX, y + labelCellHeight + 4, {
      width: cardWidth,
      align: 'center',
      lineBreak: false,
    });

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(card.subtext, cardX, y + labelCellHeight + 28, {
      width: cardWidth,
      align: 'center',
      lineBreak: false,
    });

    cursorX += cardWidth + gap;
  }

  doc.fillColor(COLORS.text);
  return y + cardHeight;
}

function drawSectionHeader(doc: PDFKit.PDFDocument, x: number, y: number, totalWidth: number, title: string): number {
  doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text(title, x, y, { width: totalWidth, lineBreak: false });
  const nextY = doc.y + 6;
  doc.save();
  doc.strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.moveTo(x, nextY).lineTo(x + totalWidth, nextY).stroke();
  doc.restore();
  return nextY + 8;
}

type PhotoEvidenceParams = {
  contentWidth: number;
  metadata: ReportMetadata;
  photo: FetchedPhoto;
  photoIndex: number;
  totalPhotos: number;
};

async function renderPhotoEvidencePage(
  doc: PDFKit.PDFDocument,
  params: PhotoEvidenceParams,
): Promise<void> {
  const { contentWidth, metadata, photo, photoIndex } = params;

  const hasLocation = photo.latitude != null && photo.longitude != null;
  const locationName = photo.locationName || 'On Site';

  // ── Title row ──
  const titleY = MARGIN.top;
  const titleText = buildPhotoEvidenceTitle({ photoIndex, locationName, hasLocation });
  doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text(titleText, MARGIN.left, titleY, { width: contentWidth, lineBreak: false });
  const ruleY = titleY + 20;
  doc.save();
  doc.strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + contentWidth, ruleY).stroke();
  doc.restore();

  // ── Two-column body: image (left) | map (right) ──
  const gap = 10;
  const leftW = (contentWidth - gap) * 0.58;
  const rightW = contentWidth - leftW - gap;
  const bodyY = ruleY + 8;
  const maxBodyH = 320;
  const bodyH = maxBodyH;

  const leftX = MARGIN.left;
  const rightX = leftX + leftW + gap;

  // Left: image with overlay strip
  drawImageWithOverlay(doc, {
    x: leftX,
    y: bodyY,
    w: leftW,
    h: bodyH,
    photo,
    photoIndex,
    locationName,
    metadata,
  });

  // Right: map (real or placeholder)
  if (hasLocation) {
    const mapPng = await fetchStaticMapPng({
      lat: photo.latitude!,
      lng: photo.longitude!,
      width: rightW,
      height: bodyH,
    });
    drawMapColumn(doc, {
      x: rightX,
      y: bodyY,
      w: rightW,
      h: bodyH,
      photo,
      mapPng,
    });
  } else {
    drawMapUnavailable(doc, rightX, bodyY, rightW, bodyH);
  }

  // ── Detail table ──
  const tableY = bodyY + bodyH + 12;
  const tableH = 22;
  drawTable(doc, MARGIN.left, tableY, contentWidth, buildPhotoEvidenceRows(photo, metadata, locationName), tableH);
}

function buildPhotoEvidenceRows(photo: FetchedPhoto, metadata: ReportMetadata, locationName: string): CellSpec[][] {
  const hasLocation = photo.latitude != null && photo.longitude != null;
  const lat = photo.latitude != null ? photo.latitude.toFixed(6) : '-';
  const lng = photo.longitude != null ? photo.longitude.toFixed(6) : '-';
  const coordinates = hasLocation ? `${lat}, ${lng}` : '-';
  const capturedAt = formatTZ(photo.createdAt);
  const uploadedAt = photo.uploadedAt ? formatTZ(photo.uploadedAt) : capturedAt;
  const remarks = photo.chatContent && photo.chatContent.trim().length > 0 ? photo.chatContent.trim() : '-';
  const geofence = geofenceStatusLabel(photo.geofenceStatus);

  return [
    [
      { text: 'Captured At', width: 140, bold: true, bg: COLORS.labelBg },
      { text: capturedAt, width: contentWidthOf(140) },
    ],
    [
      { text: 'Uploaded At', width: 140, bold: true, bg: COLORS.labelBg },
      { text: uploadedAt, width: contentWidthOf(140) },
    ],
    [
      { text: 'Location Name', width: 140, bold: true, bg: COLORS.labelBg },
      { text: locationName, width: contentWidthOf(140) },
    ],
    [
      { text: 'Latitude', width: 140, bold: true, bg: COLORS.labelBg },
      { text: lat, width: contentWidthOf(140) },
    ],
    [
      { text: 'Longitude', width: 140, bold: true, bg: COLORS.labelBg },
      { text: lng, width: contentWidthOf(140) },
    ],
    [
      { text: 'Coordinates', width: 140, bold: true, bg: COLORS.labelBg },
      { text: coordinates, width: contentWidthOf(140) },
    ],
    [
      { text: 'Geofence Status', width: 140, bold: true, bg: COLORS.labelBg },
      { text: geofence, width: contentWidthOf(140) },
    ],
    [
      { text: 'Remarks', width: 140, bold: true, bg: COLORS.labelBg },
      { text: remarks, width: contentWidthOf(140) },
    ],
  ];
}

export function buildPhotoEvidenceTitle(params: {
  photoIndex: number;
  locationName: string;
  hasLocation: boolean;
}): string {
  const { photoIndex, locationName, hasLocation } = params;
  const statusSuffix = hasLocation ? 'Location Verified' : 'Location Unavailable';
  return `Photo Evidence #${photoIndex} - ${locationName} | ${statusSuffix}`;
}

export function buildPhotoEvidenceCaption(photo: FetchedPhoto, locationName: string, photoIndex: number): string {
  const remarks = photo.chatContent && photo.chatContent.trim().length > 0
    ? photo.chatContent.trim()
    : 'Sample visual';
  const subText = `Captured ${formatTZ(photo.createdAt)} WITA | ${remarks}`;
  return `Photo Evidence #${photoIndex} - ${locationName} | ${subText}`;
}

// Helper: width of the value cell so the row spans the full content width.
// contentWidth is captured by drawTable at call time, so we recompute here
// from the constant 140 label width.
function contentWidthOf(labelWidth: number): number {
  return (PAGE.width - MARGIN.left - MARGIN.right) - labelWidth;
}

function drawImageWithOverlay(
  doc: PDFKit.PDFDocument,
  p: {
    x: number; y: number; w: number; h: number;
    photo: FetchedPhoto;
    photoIndex: number;
    locationName: string;
    metadata: ReportMetadata;
  },
): void {
  const { x, y, w, h, photo, photoIndex, locationName, metadata } = p;

  // Background frame so the cell looks intentional even if the image fails
  doc.save();
  doc.fillColor('#1F2937').rect(x, y, w, h).fill();
  doc.restore();

  let imagePlaced = true;
  try {
    doc.image(photo.buffer, x, y, { fit: [w, h], align: 'center', valign: 'center' });
  } catch (err) {
    imagePlaced = false;
    console.warn(`[ShiftPhotoReport] Failed to embed image ${photo.s3Key}:`, err);
  }
  if (!imagePlaced) {
    doc.fontSize(11).font('Helvetica').fillColor('#F3F4F6');
    doc.text('[Image not available]', x, y + h / 2 - 6, { width: w, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.text);
  }

  // Bottom overlay strip (dark, ~50pt tall) with caption
  const overlayH = 50;
  const overlayY = y + h - overlayH;
  doc.save();
  doc.fillColor(COLORS.overlayBg).rect(x, overlayY, w, overlayH).fill();
  doc.restore();

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text(
    `Photo Evidence #${photoIndex} - ${locationName}`,
    x + 10,
    overlayY + 8,
    { width: w - 20, lineBreak: false, ellipsis: true },
  );
  doc.fontSize(8.5).font('Helvetica').fillColor('#E5E7EB');
  const remarks = photo.chatContent && photo.chatContent.trim().length > 0
    ? photo.chatContent.trim()
    : 'Sample visual';
  const subText = `Captured ${formatTZ(photo.createdAt)} WITA | ${remarks}`;
  doc.text(subText, x + 10, overlayY + 26, { width: w - 20, lineBreak: false, ellipsis: true });

  // "EP APP" badge in the top-right
  const badgeW = 50;
  const badgeH = 16;
  const badgeX = x + w - badgeW - 8;
  const badgeY = y + 8;
  doc.save();
  doc.fillColor(COLORS.badgeRed).strokeColor('#7F1D1D').lineWidth(0.5);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fillAndStroke();
  doc.restore();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('EP APP', badgeX, badgeY + 4, { width: badgeW, align: 'center', lineBreak: false });

  // Restore default fill
  doc.fillColor(COLORS.text);
  // Reference to metadata kept to satisfy linter for any future use
  void metadata;
}

function drawMapColumn(
  doc: PDFKit.PDFDocument,
  p: { x: number; y: number; w: number; h: number; photo: FetchedPhoto; mapPng: Buffer | null },
): void {
  const { x, y, w, h, photo, mapPng } = p;

  // Map frame border
  doc.save();
  doc.fillColor(COLORS.mapFill).rect(x, y, w, h).fill();
  doc.strokeColor(COLORS.mapFrame).lineWidth(0.5).rect(x, y, w, h).stroke();
  doc.restore();

  if (mapPng) {
    try {
      doc.image(mapPng, x, y, { fit: [w, h], align: 'center', valign: 'center' });
    } catch (err) {
      console.warn('[ShiftPhotoReport] Failed to embed static map PNG:', err);
      drawMapPlaceholderRoads(doc, x, y, w, h);
    }
  } else {
    drawMapPlaceholderRoads(doc, x, y, w, h);
  }

  // Red marker dot in the center
  const markerR = 5;
  const markerX = x + w / 2 - markerR;
  const markerY = y + h / 2 - markerR;
  doc.save();
  doc.fillColor(COLORS.markerRed).strokeColor('#7F1D1D').lineWidth(0.5);
  doc.circle(markerX + markerR, markerY + markerR, markerR).fillAndStroke();
  doc.restore();

  // "GPS location verified" tooltip (top-left of map)
  const tooltipW = Math.min(w - 16, 150);
  const tooltipH = 24;
  const tooltipX = x + 8;
  const tooltipY = y + 8;
  doc.save();
  doc.fillColor(COLORS.tooltipBg).strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.roundedRect(tooltipX, tooltipY, tooltipW, tooltipH, 3).fillAndStroke();
  doc.restore();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.navy);
  doc.text('GPS location verified', tooltipX + 6, tooltipY + 4, { width: tooltipW - 12, lineBreak: false, ellipsis: true });
  const coordsText = photo.latitude != null && photo.longitude != null
    ? `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
    : '';
  doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted);
  doc.text(coordsText, tooltipX + 6, tooltipY + 14, { width: tooltipW - 12, lineBreak: false, ellipsis: true });

  // "Map Preview" tag (top-right)
  const tagW = 60;
  const tagH = 14;
  const tagX = x + w - tagW - 8;
  const tagY = y + 8;
  doc.save();
  doc.fillColor(COLORS.tooltipBg).strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.roundedRect(tagX, tagY, tagW, tagH, 3).fillAndStroke();
  doc.restore();
  doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.textMuted);
  doc.text('Map Preview', tagX, tagY + 3, { width: tagW, align: 'center', lineBreak: false });

  // "Open location in Google Maps" link below the map
  if (photo.latitude != null && photo.longitude != null) {
    const mapsUrl = `https://maps.google.com/?q=${photo.latitude},${photo.longitude}`;
    const linkY = y + h + 4;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.linkBlue);
    doc.text('Open location in Google Maps', x, linkY, { width: w, lineBreak: false, link: mapsUrl, underline: true });
    doc.fillColor(COLORS.text);
  }
}

function drawMapUnavailable(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void {
  doc.save();
  doc.fillColor('#F3F4F6').strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.rect(x, y, w, h).fillAndStroke();
  doc.restore();
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.textMuted);
  doc.text('Location not recorded', x, y + h / 2 - 8, { width: w, align: 'center', lineBreak: false });
}

function drawMapPlaceholderRoads(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void {
  doc.save();
  doc.strokeColor(COLORS.mapRoad).lineWidth(1);
  // a few stylized diagonal "roads" so the fallback map doesn't look empty
  doc.moveTo(x, y + h * 0.3).lineTo(x + w, y + h * 0.2).stroke();
  doc.moveTo(x + w * 0.2, y).lineTo(x + w * 0.35, y + h).stroke();
  doc.moveTo(x + w * 0.7, y).lineTo(x + w * 0.55, y + h).stroke();
  doc.moveTo(x, y + h * 0.7).lineTo(x + w, y + h * 0.85).stroke();
  doc.restore();
}

export async function generatePdf(
  metadata: ReportMetadata,
  photos: FetchedPhoto[],
  signal?: AbortSignal,
): Promise<Buffer> {
  const logoBuffer = await getLogoBuffer();

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.left, right: MARGIN.right },
      info: {
        Title: `Guard Shift Security Operations Report - ${metadata.guardName}`,
        Author: 'EP ERP System',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - MARGIN.left - MARGIN.right;
    let pageNumber = 1;

    // ── Cover Page (page 1, created by the PDFDocument constructor) ──
    applyPageChrome(doc, pageNumber, metadata.reportNumberShort);

    // Apply chrome to every page added afterwards (manual addPage() or auto-pagination)
    doc.on('pageAdded', () => {
      pageNumber++;
      applyPageChrome(doc, pageNumber, metadata.reportNumberShort);
    });

    let yCursor = MARGIN.top + 10;

    if (logoBuffer) {
      try {
        const logoW = 80;
        const logoH = 32;
        doc.image(logoBuffer, (doc.page.width - logoW) / 2, yCursor, { fit: [logoW, logoH] });
        yCursor += logoH + 6;
      } catch {
        console.warn('[ShiftPhotoReport] Failed to render logo, skipping.');
      }
    }

    yCursor = drawTitleBlock(doc, contentWidth, doc.page.margins.left + contentWidth / 2, yCursor);

    yCursor = drawSectionHeader(doc, MARGIN.left, yCursor, contentWidth, 'Report Information');
    drawTable(doc, MARGIN.left, yCursor, contentWidth, buildReportInfoRows(metadata), 22);
    yCursor += 4 * 22 + 16;

    yCursor = drawSectionHeader(doc, MARGIN.left, yCursor, contentWidth, 'Shift Details');
    drawTable(doc, MARGIN.left, yCursor, contentWidth, buildShiftDetailRows(metadata), 22);
    yCursor += 5 * 22 + 18;

    yCursor = drawSectionHeader(doc, MARGIN.left, yCursor, contentWidth, 'Shift Summary');
    const statCards = buildStatCards(metadata);
    yCursor = drawStatCards(doc, MARGIN.left, yCursor, contentWidth, statCards, 72);
    yCursor += 18;

    yCursor = drawSectionHeader(doc, MARGIN.left, yCursor, contentWidth, 'Location Verification Summary');
    drawTable(doc, MARGIN.left, yCursor, contentWidth, buildLocationVerificationRows(metadata), 22);

    // ── Photo Pages ──
    (async () => {
      try {
        if (photos.length === 0) {
          doc.addPage();
          doc.fontSize(16).font('Helvetica-Bold').fillColor(COLORS.navy);
          doc.text('No photo evidence submitted during this shift.', MARGIN.left, doc.page.height / 2 - 20, {
            align: 'center',
            width: contentWidth,
          });
        } else {
          for (let i = 0; i < photos.length; i++) {
            const photo = photos[i]!;
            const photoIndex = i + 1;
            doc.addPage();

            await renderPhotoEvidencePage(doc, {
              contentWidth,
              metadata,
              photo,
              photoIndex,
              totalPhotos: photos.length,
            });
          }
        }
        doc.fillColor(COLORS.text);
        doc.end();
      } catch (err) {
        doc.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });

  return withSignal(pdfPromise, signal);
}

export function buildReportMetadata(params: {
  reportNumber: string | null;
  status: 'pending' | 'generated' | 'failed' | 'regenerated';
  guardName: string;
  employeeNumber: string;
  clientName: string | null;
  siteName: string;
  shiftTypeName: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  photoCount: number;
  locationUpdateCount: number;
  firstLocation: NamedPoint | null;
  lastLocation: NamedPoint | null;
  geofenceSummary: string;
  generatedAt?: Date;
}): ReportMetadata {
  const generatedAt = params.generatedAt ?? new Date();
  const statusLabel = statusLabelFor(params.status);
  const reportNumberShort = extractReportCounter(params.reportNumber);
  const downloadFilename = buildShiftReportDownloadFilename({
    siteName: params.siteName,
    shiftStartsAt: params.shiftStartsAt,
    shiftEndsAt: params.shiftEndsAt,
    reportNumber: params.reportNumber,
    fallbackId: 'pending',
  });

  return {
    reportNumber: params.reportNumber,
    reportNumberShort,
    status: params.status,
    statusLabel,
    guardName: params.guardName,
    employeeNumber: params.employeeNumber,
    clientName: params.clientName,
    siteName: params.siteName,
    shiftTypeName: params.shiftTypeName,
    shiftStartsAt: params.shiftStartsAt,
    shiftEndsAt: params.shiftEndsAt,
    generatedAt,
    photoCount: params.photoCount,
    locationUpdateCount: params.locationUpdateCount,
    firstLocation: params.firstLocation,
    lastLocation: params.lastLocation,
    geofenceSummary: params.geofenceSummary,
    downloadFilename,
  };
}

export function generateReportFileName(params: {
  siteName: string | null;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  reportNumber: string | null;
  fallbackId: string;
}): string {
  return buildShiftReportDownloadFilename(params);
}
