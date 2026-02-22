'use client';

import { Serialized } from '@/lib/utils';
import { Alert, Shift, ShiftType, Site } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';

type SiteWithOptionalRelations = Serialized<Site>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type EmployeeWithOptionalRelations = Serialized<EmployeeWithRelations>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: EmployeeWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  status?: string;
};

interface AlarmInterfaceProps {
  alerts: AlertWithRelations[];
}

export default function AlarmInterface({ alerts }: AlarmInterfaceProps) {
  // Audio logic has been moved to GlobalAlertManager

  const hasActiveAlerts = alerts.some(alert => !alert.resolvedAt && alert.status !== 'need_attention');

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl shadow-sm border transition-colors ${
        hasActiveAlerts ? 'bg-red-500/10 border-red-500/20' : 'bg-card border-border'
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`p-3 rounded-full ${
            hasActiveAlerts ? 'bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse' : 'bg-muted text-muted-foreground'
          }`}
        >
          {hasActiveAlerts ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
              />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          )}
        </div>
        <div>
          <h3 className={`font-bold ${hasActiveAlerts ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
            {hasActiveAlerts ? 'ALARM TRIGGERED' : 'System Normal'}
          </h3>
          <p className={`text-sm ${hasActiveAlerts ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
            {hasActiveAlerts
              ? `${alerts.filter(a => a.status !== 'need_attention').length} active alert${alerts.filter(a => a.status !== 'need_attention').length === 1 ? '' : 's'} require attention`
              : 'No active alerts detected'}
          </p>
        </div>
      </div>
    </div>
  );
}
