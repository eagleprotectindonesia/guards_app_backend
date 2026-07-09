'use client';

import { useEffect, useRef } from 'react';
import { CalendarPlus, Eye } from 'lucide-react';

interface DateContextMenuProps {
  date: string;
  x: number;
  y: number;
  onAddNewEvent: () => void;
  onViewDay?: () => void;
  onClose: () => void;
}

export function DateContextMenu({ x, y, onAddNewEvent, onViewDay, onClose }: DateContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
      onContextMenu={e => e.preventDefault()}
      className="bg-popover text-popover-foreground z-50 min-w-45 overflow-hidden rounded-md border p-1 shadow-md animate-in fade-in-0 zoom-in-95"
    >
      <button
        role="menuitem"
        onClick={onAddNewEvent}
        className="focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <CalendarPlus className="mr-2 h-4 w-4" />
        Add new event
      </button>
      {onViewDay && (
        <button
          role="menuitem"
          onClick={onViewDay}
          className="focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <Eye className="mr-2 h-4 w-4" />
          View day
        </button>
      )}
    </div>
  );
}
