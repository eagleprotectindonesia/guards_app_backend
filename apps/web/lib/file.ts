export function isVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  try {
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname.toLowerCase();
    return videoExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return videoExtensions.some(ext => lower.endsWith(ext));
  }
}

export function isImageFile(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  try {
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname.toLowerCase();
    return imageExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext));
  }
}

export function isPdfFile(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.pdf');
}

export function getAttachmentDisplayName(url: string, index: number): string {
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    const segment = pathname.split('/').pop() || '';
    const decoded = decodeURIComponent(segment);
    if (decoded && /[a-z]/i.test(decoded.replace(/\.[^.]+$/, ''))) return decoded;
  } catch {
    /* fall through */
  }
  return `Attachment ${index + 1}`;
}
