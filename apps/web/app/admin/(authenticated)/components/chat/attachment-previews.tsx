'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatAttachmentPreviewsProps {
  previews: string[];
  onRemove: (index: number) => void;
  className?: string;
  itemClassName?: string;
}

export function ChatAttachmentPreviews({
  previews,
  onRemove,
  className,
  itemClassName
}: ChatAttachmentPreviewsProps) {
  if (previews.length === 0) return null;

  return (
    <div className={cn('px-6 py-3 bg-card border-t border-border flex gap-3 overflow-x-auto shrink-0', className)}>
      {previews.map((url, i) => (
        <div key={i} className={cn('relative h-20 w-20 shrink-0 shadow-sm', itemClassName)}>
          <img
            src={url}
            alt="Preview"
            className="h-full w-full object-cover rounded-lg border border-border"
          />
          <button
            onClick={() => onRemove(i)}
            type="button"
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
