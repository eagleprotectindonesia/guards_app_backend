import { Ticket, ShieldCheck, CircleDashed, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { DashboardRow } from './ticket-overview-dashboard.types';

export const METRIC_ICONS = {
  ticket: Ticket,
  shield: ShieldCheck,
  progress: CircleDashed,
  resolved: CheckCircle2,
  breach: TriangleAlert,
} as const;

export const CATEGORY_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981'];

export const STATUS_OPTIONS = [
  'NEW',
  'ACKNOWLEDGED',
  'WAITING_INFORMATION',
  'IN_PROGRESS',
  'SOLVED',
  'CLOSED',
  'CANNOT_RESOLVE',
  'CANCELLED',
] as const;

export const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'] as const;

export function priorityClass(priority: DashboardRow['priority']) {
  if (priority === 'HIGH') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (priority === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

export function toStatusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export function getStatusLabel(status: string) {
  if (status === 'NEW' || status === 'ACKNOWLEDGED') return 'Open';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'WAITING_INFORMATION') return 'Waiting Info';
  if (status === 'SOLVED') return 'Resolved';
  if (status === 'CLOSED') return 'Closed';
  if (status === 'CANNOT_RESOLVE') return 'Unresolved';
  if (status === 'CANCELLED') return 'Cancelled';
  return status.replaceAll('_', ' ');
}

export function getCategoryStyle(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('it') || normalized.includes('tech') || normalized.includes('support')) {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-400';
  }
  if (normalized.includes('medical') || normalized.includes('health') || normalized.includes('safety')) {
    return 'border-violet-500/20 bg-violet-500/10 text-violet-400';
  }
  if (normalized.includes('site') || normalized.includes('property') || normalized.includes('access')) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
  }
  if (normalized.includes('equipment') || normalized.includes('device') || normalized.includes('damage')) {
    return 'border-orange-500/20 bg-orange-500/10 text-orange-400';
  }
  if (normalized.includes('hr') || normalized.includes('staff') || normalized.includes('request')) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  }
  if (normalized.includes('incident') || normalized.includes('report') || normalized.includes('emergency')) {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-400';
  }
  return 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400';
}

export function buildConicGradient(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return 'conic-gradient(#1f2937 0% 100%)';
  }

  let current = 0;
  const parts = segments.map(segment => {
    const start = current;
    current += (segment.value / total) * 100;
    return `${segment.color} ${start}% ${current}%`;
  });

  return `conic-gradient(${parts.join(', ')})`;
}
