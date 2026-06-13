import { Card } from '@/components/ui/card';

export function MetricsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="border-border/60 bg-card p-5 shadow-md">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-muted shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-7 w-12 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function FiltersSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between w-full animate-pulse">
      <div className="h-10 flex-1 min-w-65 rounded-lg border border-border/60 bg-card" />
      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-3 shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 min-w-32.5">
            <div className="h-3 w-12 rounded bg-muted" />
            <div className="h-10 w-full rounded-lg border border-border/60 bg-card" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <Card className="overflow-hidden border-border/60 bg-card shadow-md flex flex-col justify-between min-h-[580px] animate-pulse">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr className="border-b border-border/40">
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="px-5 py-4">
                  <div className="h-3 w-16 rounded bg-muted" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {Array.from({ length: 8 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/25">
                <td className="px-5 py-4"><div className="h-4 w-12 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="h-4 w-36 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="h-5 w-20 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="space-y-1"><div className="h-4 w-24 rounded bg-muted" /><div className="h-3 w-16 rounded bg-muted/70" /></div></td>
                <td className="px-5 py-4"><div className="h-5 w-16 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="h-5 w-16 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-muted" /></td>
                <td className="px-5 py-4"><div className="space-y-1"><div className="h-4 w-12 rounded bg-muted" /><div className="h-3 w-16 rounded bg-muted/70" /></div></td>
                <td className="px-5 py-4"><div className="h-5 w-16 rounded bg-muted" /></td>
                <td className="px-5 py-4 text-right"><div className="h-8 w-8 rounded bg-muted ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-8 w-8 rounded bg-muted" />
        </div>
      </div>
    </Card>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Ticket Shortcuts */}
      <Card className="border-border/60 bg-card p-4 shadow-md space-y-4">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded-xl border border-border/40 bg-background/50" />
          ))}
        </div>
      </Card>

      {/* Tickets by Category */}
      <Card className="border-border/60 bg-card p-4 shadow-md space-y-4">
        <div className="h-3 w-36 rounded bg-muted" />
        <div className="flex justify-center py-2">
          <div className="h-32 w-32 rounded-full border-8 border-muted flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-card" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      </Card>

      {/* SLA Status */}
      <Card className="border-border/60 bg-card p-4 shadow-md space-y-4">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="flex justify-center py-2">
          <div className="h-32 w-32 rounded-full border-8 border-muted flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-card" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
              <div className="h-3 w-8 rounded bg-muted" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
