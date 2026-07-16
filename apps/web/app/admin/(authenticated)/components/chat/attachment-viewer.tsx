'use client';

import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@repo/shared';
import { isVideoFile } from '@/lib/file';

interface AttachmentViewerProps {
  attachments: string[];
  index?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AttachmentViewer({ attachments, index = 0, open, onOpenChange }: AttachmentViewerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: index });
  const [selected, setSelected] = useState(index);

  useEffect(() => {
    if (emblaApi && open) emblaApi.scrollTo(index, true);
  }, [open, index, emblaApi]);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
      else if (e.key === 'ArrowLeft') scrollPrev();
      else if (e.key === 'ArrowRight') scrollNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange, scrollPrev, scrollNext]);

  const hasMultiple = attachments.length > 1;

  return (
    <div
      className={cn('fixed inset-0 z-[100] flex items-center justify-center bg-black/90', open ? 'block' : 'hidden')}
      onClick={() => onOpenChange(false)}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        onClick={e => {
          e.stopPropagation();
          onOpenChange(false);
        }}
      >
        <X size={20} />
      </button>

      {hasMultiple && (
        <button
          type="button"
          aria-label="Previous"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          onClick={e => {
            e.stopPropagation();
            scrollPrev();
          }}
          disabled={selected === 0}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <div className="h-full w-full overflow-hidden" ref={emblaRef} onClick={e => e.stopPropagation()}>
        <div className="flex h-full touch-pan-y">
          {attachments.map((url, i) => (
            <div key={i} className="flex min-w-0 flex-[0_0_100%] items-center justify-center p-4">
              {isVideoFile(url) ? (
                <video src={url} controls className="max-h-[90vh] max-w-full rounded-lg" />
              ) : (
                <img src={url} alt={`Attachment ${i + 1}`} className="max-h-[90vh] max-w-full object-contain" />
              )}
            </div>
          ))}
        </div>
      </div>

      {hasMultiple && (
        <button
          type="button"
          aria-label="Next"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          onClick={e => {
            e.stopPropagation();
            scrollNext();
          }}
          disabled={selected === attachments.length - 1}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {hasMultiple && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {attachments.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 w-1.5 rounded-full transition-colors', i === selected ? 'bg-white' : 'bg-white/40')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
