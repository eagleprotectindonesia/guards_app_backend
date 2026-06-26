import React from 'react';
import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';

type Props = {
  total: number;
};

export function TotalEmployeesCard({ total }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-sky-600 dark:text-sky-400 shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          Total Employees
        </p>
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight text-foreground">{total}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">All Employees</p>
      </div>
    </Card>
  );
}
