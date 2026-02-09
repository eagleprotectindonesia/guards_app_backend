'use client';

import Modal from '../../components/modal';
import { format } from 'date-fns';
import { ArrowRight, Info, History } from 'lucide-react';

type ChangelogDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  details: Record<string, string> | { changes: Record<string, { from: string; to: string }> } | null;
};

export default function ChangelogDetailsModal({ isOpen, onClose, details }: ChangelogDetailsModalProps) {
  if (!details) return null;

  const { changes, ...snapshot } = details;

  const formatValue = (key: string, value: boolean | string) => {
    if (value === null || value === undefined)
      return <span className="text-muted-foreground italic text-xs">None</span>;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    // Check if it's a date string (ISO format usually stored in JSON)
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      try {
        const date = new Date(value);
        // If it's just a date (like shift.date), format it as PPP
        if (key.toLowerCase().includes('date') && !key.toLowerCase().includes('at')) {
          return format(date, 'PPP');
        }
        // Otherwise format as full date time
        return format(date, 'PPP p');
      } catch {
        return value;
      }
    }

    return String(value);
  };

  const labelize = (key: string) => {
    const specialCases: Record<string, string> = {
      requiredCheckinIntervalMins: 'Check-in Interval',
      graceMinutes: 'Grace Period',
      startsAt: 'Start Time',
      endsAt: 'End Time',
      employeeId: 'Employee ID',
      siteId: 'Site ID',
      shiftTypeId: 'Shift Type ID',
      employeeName: 'Employee',
      siteName: 'Site',
      shiftTypeName: 'Shift Type',
    };

    if (specialCases[key]) return specialCases[key];

    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Id$/, '')
      .replace(/Mins$/, '')
      .trim();
  };

  const hasChanges = changes && Object.keys(changes).length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Details">
      <div className="p-6 max-h-[80vh] overflow-y-auto space-y-8 scrollbar-hide">
        {/* Changes Section (Detailed Diff) */}
        {hasChanges && (
          <section className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs uppercase tracking-widest mb-4">
              <History size={14} />
              Modified Fields
            </div>
            <div className="grid gap-3">
              {Object.entries(changes).map(([key, change]: [string, { from: string; to: string }]) => (
                <div key={key} className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col gap-2">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                    {labelize(key)}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-lg text-sm text-red-700 dark:text-red-400 line-through opacity-70">
                      {formatValue(key, change.from)}
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-700 dark:text-green-400 font-bold">
                      {formatValue(key, change.to)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Snapshot Section (Current state at time of log) */}
        <section className="animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-2 text-muted-foreground font-bold text-xs uppercase tracking-widest mb-4">
            <Info size={14} />
            Data Snapshot
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 bg-muted/20 border border-border p-5 rounded-2xl">
            {Object.entries(snapshot).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5 py-1 border-b border-border/50 last:border-0">
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter">
                  {labelize(key)}
                </span>
                <span className="text-sm font-medium text-foreground truncate" title={String(value)}>
                  {formatValue(key, value)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-foreground text-background font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
