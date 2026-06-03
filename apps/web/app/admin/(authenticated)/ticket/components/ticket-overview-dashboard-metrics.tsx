import { Card } from '@/components/ui/card';
import { cn } from '@repo/shared';
import { METRIC_ICONS } from './ticket-overview-dashboard.utils';
import type { OverviewMetric } from './ticket-overview-dashboard.types';

type Props = {
  metrics: OverviewMetric[];
};

function getMetricValueColor(icon: OverviewMetric['icon']) {
  if (icon === 'ticket') return 'text-sky-400';
  if (icon === 'shield') return 'text-amber-500';
  if (icon === 'progress') return 'text-emerald-500';
  if (icon === 'resolved') return 'text-violet-400';
  return 'text-rose-500';
}

function getMetricHintColor(hintTone: OverviewMetric['hintTone']) {
  if (hintTone === 'positive') return 'text-emerald-400 font-medium';
  if (hintTone === 'warning') return 'text-amber-400 font-medium';
  if (hintTone === 'critical') return 'text-rose-400 font-medium';
  return 'text-muted-foreground';
}

export function TicketOverviewMetrics({ metrics }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
      {metrics.map(metric => {
        const Icon = METRIC_ICONS[metric.icon];

        return (
          <Card key={metric.label} className="border-[#1f2432] bg-[#11141d] p-5 shadow-md hover:border-[#2f374c] transition-colors">
            <div className="flex items-center gap-4">
              <div className={cn('rounded-xl border p-3 shrink-0', metric.accentClass)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">{metric.label}</p>
                <p className={cn('text-3xl font-extrabold tracking-tight', getMetricValueColor(metric.icon))}>{metric.value}</p>
                <p className={cn('text-xs', getMetricHintColor(metric.hintTone))}>{metric.hint}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
