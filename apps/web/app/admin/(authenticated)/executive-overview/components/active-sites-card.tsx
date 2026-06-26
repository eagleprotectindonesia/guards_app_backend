import React from 'react';
import { Card } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { ProgressBar } from './progress-bar';

type Props = {
  activeSites: number;
  totalSites: number;
};

export function ActiveSitesCard({ activeSites, totalSites }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-2.5 text-purple-600 dark:text-purple-400 shrink-0">
          <Building2 className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          Active Sites
        </p>
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight text-foreground">
          <span className="text-purple-600 dark:text-purple-400">{activeSites}</span>
          <span className="text-muted-foreground/50 mx-1.5">/</span>
          <span>{totalSites}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Online / Total Sites</p>
      </div>
      {totalSites > 0 && (
        <div className="space-y-1">
          <ProgressBar pct={(activeSites / totalSites) * 100} color="purple" />
          <p className="text-[10px] font-medium text-purple-600 dark:text-purple-400">
            {((activeSites / totalSites) * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </Card>
  );
}
