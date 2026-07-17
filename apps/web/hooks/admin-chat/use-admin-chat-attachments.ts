'use client';

import { useCallback, useEffect, useState } from 'react';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';

export function useAdminChatAttachments() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const clearFiles = useCallback(() => {
    setPreviews(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return [];
    });
    setSelectedFiles([]);
  }, []);

  const handleFileChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const allowedFiles = files.filter(
        file => file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf'
      );
      if (allowedFiles.length !== files.length) {
        toast.error('Only image, video, or PDF files are allowed in this chat');
      }

      if (allowedFiles.length === 0) return;

      setIsOptimizing(true);
      try {
        const imageFiles = allowedFiles.filter(file => file.type.startsWith('image/'));
        const processedFiles = await Promise.all(imageFiles.map(file => optimizeImage(file)));
        const pdfFiles = allowedFiles.filter(file => file.type === 'application/pdf');
        const currentFiles = [...selectedFiles, ...processedFiles, ...pdfFiles].slice(0, 4);
        setSelectedFiles(currentFiles);

        const newPreviews = [...processedFiles, ...pdfFiles].map(file => URL.createObjectURL(file));
        setPreviews(prev => {
          const combined = [...prev, ...newPreviews];
          const overflow = combined.slice(4);
          overflow.forEach(url => URL.revokeObjectURL(url));
          return combined.slice(0, 4);
        });
      } catch (error) {
        console.error('File processing failed:', error);
        toast.error('Failed to process images');
      } finally {
        setIsOptimizing(false);
      }
    },
    [selectedFiles]
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, fileIndex) => fileIndex !== index));
    setPreviews(prev => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target);
      return prev.filter((_, previewIndex) => previewIndex !== index);
    });
  }, []);

  useEffect(() => {
    return () => {
      previews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previews]);

  return {
    selectedFiles,
    previews,
    isOptimizing,
    handleFileChange,
    removeFile,
    clearFiles,
  };
}
