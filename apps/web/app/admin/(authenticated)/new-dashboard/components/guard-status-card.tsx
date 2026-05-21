import { UserCheck } from 'lucide-react';

type GuardStatusCardProps = {
  onDutyCount: number;
};

export function GuardStatusCard({ onDutyCount }: GuardStatusCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Guard Status</h3>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserCheck className="h-4 w-4 text-green-500" />
          <span>On Duty</span>
        </div>
        <span className="text-xl font-bold text-green-600 dark:text-green-400">{onDutyCount}</span>
      </div>
    </div>
  );
}
