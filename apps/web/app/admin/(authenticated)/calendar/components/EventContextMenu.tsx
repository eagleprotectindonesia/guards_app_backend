'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, SquarePen, Copy, Trash2 } from 'lucide-react';
import type { CalendarItem } from '../types';

interface EventContextMenuProps {
  event: CalendarItem;
  x: number;
  y: number;
  hasEditPermission: boolean;
  hasDeletePermission: boolean;
  hasDuplicatePermission: boolean;
  onClose: () => void;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const menuItemClass =
  'focus:bg-accent focus:text-accent-foreground [&_svg:not([class*="text-"])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4';

export function EventContextMenu({
  event,
  x,
  y,
  hasEditPermission,
  hasDeletePermission,
  hasDuplicatePermission,
  onClose,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: EventContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      style={{ position: 'fixed', top: Math.min(y, window.innerHeight - 300), left: Math.min(x, window.innerWidth - 200), zIndex: 9999 }}
      onContextMenu={e => e.preventDefault()}
      className="bg-popover text-popover-foreground z-50 min-w-45 overflow-hidden rounded-md border p-1 shadow-md animate-in fade-in-0 zoom-in-95"
    >
      <div className="border-b border-border px-2 py-1.5 text-xs font-medium text-muted-foreground truncate max-w-48">
        {event.title}
      </div>
      {confirmDelete ? (
        <>
          <div className="px-2 py-1.5 text-sm text-foreground">Delete this event?</div>
          <button role="menuitem" onClick={onDelete} className={`${menuItemClass} text-red-400`}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </button>
          <button role="menuitem" onClick={() => setConfirmDelete(false)} className={menuItemClass}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button role="menuitem" onClick={onView} className={menuItemClass}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </button>
          {hasEditPermission && (
            <button role="menuitem" onClick={onEdit} className={menuItemClass}>
              <SquarePen className="mr-2 h-4 w-4" />
              Edit
            </button>
          )}
          {hasDuplicatePermission && (
            <button role="menuitem" onClick={onDuplicate} className={menuItemClass}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate...
            </button>
          )}
          {hasDeletePermission && (
            <button role="menuitem" onClick={() => setConfirmDelete(true)} className={`${menuItemClass} text-red-400`}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </button>
          )}
        </>
      )}
    </div>
  );
}
