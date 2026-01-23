export function isVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  try {
    // In React Native, we might not have a full URL object with base
    const lower = url.toLowerCase();
    // Simple check for extension at the end of the path (before query params)
    const path = lower.split('?')[0];
    return videoExtensions.some(ext => path.endsWith(ext));
  } catch {
    return false;
  }
}

export function isImageFile(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  try {
    const lower = url.toLowerCase();
    const path = lower.split('?')[0];
    return imageExtensions.some(ext => path.endsWith(ext));
  } catch {
    return false;
  }
}
