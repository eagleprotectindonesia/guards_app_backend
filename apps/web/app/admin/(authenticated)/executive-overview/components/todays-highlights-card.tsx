import React from 'react';
import { Card } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { cn } from '@repo/shared';
import type { ChangelogFeedItem } from '@repo/database';

const TZ = 'Asia/Makassar';

function formatWitaTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

const dotColorMap: Record<string, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  neutral: 'bg-muted-foreground/50',
};

type Props = {
  highlights: ChangelogFeedItem[];
};

export function TodaysHighlightsCard({ highlights }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400 shrink-0">
          <Star className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Today&apos;s Highlights
          </p>
          <p className="text-[10px] text-muted-foreground">Latest Activity</p>
        </div>
      </div>
      <div className="grid gap-2">
        {highlights.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No activity yet today</p>
        ) : (
          highlights.map((item) => {
            const dot = dotColorMap[item.iconAccent] ?? dotColorMap.neutral;
            return (
              <div
                key={`${item.entityType}-${item.id}`}
                className={cn(
                  'flex items-start gap-3 p-2 rounded-xl border transition-all duration-200',
                  'border-border/10 bg-muted/5 hover:bg-muted/[0.07]'
                )}
              >
                <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-foreground leading-snug truncate">
                    {item.message}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {formatWitaTime(item.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
