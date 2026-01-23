export * from '@repo/shared';

export function isVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  try {
    const urlObj = new URL(url, 'http://localhost'); // Use dummy base for relative paths
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
