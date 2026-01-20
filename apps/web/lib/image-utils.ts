/**
 * Optimizes an image file by resizing it and converting it to WebP.
 * Limits the longest dimension to the specified maxDimension.
 * If the file is already WebP and within dimensions, it returns the original file.
 */
export async function optimizeImage(file: File, maxDimension: number = 1920): Promise<File> {
  return new Promise((resolve, reject) => {
    // If it's not an image, return original file
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const width = img.width;
        const height = img.height;

        // Skip processing if already webp and within bounds
        if (file.type === 'image/webp' && width <= maxDimension && height <= maxDimension) {
          return resolve(file);
        }

        let newWidth = width;
        let newHeight = height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxDimension) {
            newHeight *= maxDimension / width;
            newWidth = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            newWidth *= maxDimension / height;
            newHeight = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        canvas.toBlob(
          blob => {
            if (blob) {
              // Convert to WebP to reduce size, preserve original name but change extension if needed
              const fileName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
              const optimizedFile = new File([blob], fileName, {
                type: 'image/webp',
                lastModified: Date.now(),
              });
              resolve(optimizedFile);
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          'image/webp',
          0.8 // quality: 0.8 is excellent for WebP
        );
      };
      img.onerror = err => reject(err);
    };
    reader.onerror = err => reject(err);
  });
}
