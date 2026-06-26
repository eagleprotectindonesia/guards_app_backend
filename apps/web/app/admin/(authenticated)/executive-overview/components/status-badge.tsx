import React from 'react';
import { cn } from '@repo/shared';

type Props = {
  count: number;
  label: string;
  variant: 'sky' | 'amber' | 'purple';
};

const variantStyles = {
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
};

export function StatusBadge({ count, label, variant }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-tight',
        variantStyles[variant]
      )}
    >
      <span className="tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}
