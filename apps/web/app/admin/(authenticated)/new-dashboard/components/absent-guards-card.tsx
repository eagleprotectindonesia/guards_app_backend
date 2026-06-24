import { UserX } from 'lucide-react';

type AbsentGuardsCardProps = {
  siteGuardsCount: number;
  controlCount: number;
};

export function AbsentGuardsCard({ siteGuardsCount, controlCount }: AbsentGuardsCardProps) {
  const total = siteGuardsCount + controlCount;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <UserX className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Absent Guards</p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
        </div>
      </div>
      <div className="border-t border-border/40 mt-1.5 pt-1.5 grid grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Site Guards</p>
          <p className="text-2xl font-extrabold tracking-tight leading-none text-foreground">{siteGuardsCount}</p>
        </div>
        <div className="pl-2 rounded-sm bg-slate-500/4 dark:bg-slate-400/4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Control</p>
          <p className="text-2xl font-extrabold tracking-tight leading-none text-slate-500 dark:text-slate-400">{controlCount}</p>
        </div>
      </div>
    </div>
  );
}
