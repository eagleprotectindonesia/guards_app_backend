export const ATTENDANCE_PHOTO_MAX_DIMENSION = 1280;
export const ATTENDANCE_PHOTO_QUALITY = 0.8;
export const ATTENDANCE_PHOTO_CONTENT_TYPE = 'image/webp';

export function buildResizeAction(width?: number, height?: number) {
  if (!width || !height) return null;

  const longestSide = Math.max(width, height);
  if (longestSide <= ATTENDANCE_PHOTO_MAX_DIMENSION) return null;

  if (width >= height) {
    return { resize: { width: ATTENDANCE_PHOTO_MAX_DIMENSION } };
  }

  return { resize: { height: ATTENDANCE_PHOTO_MAX_DIMENSION } };
}
