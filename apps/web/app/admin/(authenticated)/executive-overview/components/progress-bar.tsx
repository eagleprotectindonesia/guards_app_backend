import React from 'react';
import { cn } from '@repo/shared';

type Props = {
  pct: number;
  color: 'emerald' | 'purple';
};

export function ProgressBar({ pct, color }: Props) {
  const [trackClass, fillClass] =
    color === 'emerald'
      ? ['bg-emerald-500/20', 'bg-emerald-500']
      : ['bg-purple-500/20', 'bg-purple-500'];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', trackClass)}>
      <div className={cn('h-full rounded-full transition-all', fillClass)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
