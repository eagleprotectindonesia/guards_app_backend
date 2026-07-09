import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export const IMAGE_CONFIG = {
  MAX_DIMENSION: 1920,
  COMPRESS_QUALITY: 0.8,
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
} as const;

export type OptimizedUploadInfo = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export async function optimizeImage(
  asset: ImagePicker.ImagePickerAsset
): Promise<OptimizedUploadInfo> {
  const ImageManipulator = await import('expo-image-manipulator');

  const longestSide = Math.max(asset.width, asset.height);
  const actions =
    longestSide > IMAGE_CONFIG.MAX_DIMENSION
      ? [
          asset.width >= asset.height
            ? { resize: { width: IMAGE_CONFIG.MAX_DIMENSION } }
            : { resize: { height: IMAGE_CONFIG.MAX_DIMENSION } },
        ]
      : [];

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: IMAGE_CONFIG.COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.WEBP,
  });

  const file = new File(result.uri);
  if (!file.exists || (file.size ?? 0) <= 0) {
    throw new Error('Optimized image is empty');
  }

  const fileSize = file.size ?? 0;
  if (fileSize > IMAGE_CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new Error('Image too large after optimization');
  }

  const baseName =
    asset.fileName?.replace(/\.[^.]+$/, '') || `image_${Date.now()}`;

  return {
    uri: result.uri,
    fileName: `${baseName}.webp`,
    mimeType: 'image/webp',
    fileSize,
  };
}
