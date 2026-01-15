'use client';

import { Alert, Shift, Site, ShiftType, Admin } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';
import { Serialized } from '@/lib/utils';
import { Check, CheckCircle, Clock, Eye, User } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

// Define types locally or import if shared (duplicating for now to ensure self-containment)
type EmployeeWithOptionalRelations = Serialized<ExtendedEmployee>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;
type AdminWithOptionalRelations = Serialized<Admin>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: EmployeeWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  resolverAdmin?: AdminWithOptionalRelations | null;
  ackAdmin?: AdminWithOptionalRelations | null;
  status?: string;
};

interface AlertItemProps {
  alert: AlertWithRelations;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  showResolutionDetails?: boolean;
}

export default function AlertItem({ alert, onAcknowledge, onResolve, showResolutionDetails = false }: AlertItemProps) {
  const isResolved = !!alert.resolvedAt;
  const isAcknowledged = !!alert.acknowledgedAt;
  const isCritical = alert.severity === 'critical';
  const isNeedAttention = alert.status === 'need_attention';

  return (
    <div
      className={`group relative overflow-hidden bg-card rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
        isResolved
          ? 'border-border opacity-60 bg-muted/30'
          : isCritical
          ? 'border-l-4 border-l-red-500 border-y-red-100 border-r-red-100 dark:border-y-red-900/20 dark:border-r-red-900/20'
          : isNeedAttention
          ? 'border-l-4 border-l-yellow-400 border-y-yellow-100 border-r-yellow-100 dark:border-y-yellow-900/20 dark:border-r-yellow-900/20'
          : 'border-l-4 border-l-orange-400 border-y-orange-100 border-r-orange-100 dark:border-y-orange-900/20 dark:border-r-orange-900/20'
      }`}
    >
      <div className="p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                  isCritical
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                    : isNeedAttention
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
                }`}
              >
                {isNeedAttention ? 'ATTENTION NEEDED' : alert.reason.replace('_', ' ')}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {format(new Date(alert.windowStart), 'yyyy/MM/dd HH:mm')}
              </span>
            </div>

            <h4 className="text-lg font-medium text-foreground mb-1">{alert.site?.name}</h4>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4 text-muted-foreground/60" />
                {alert.shift?.employee ? (
                  <Link
                    href={`/admin/employees/${alert.shift.employee.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {alert.shift.employee.fullName}
                  </Link>
                ) : (
                  'Unassigned Employee'
                )}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground/60" />
                {alert.shift?.shiftType?.name}
              </span>
            </div>

            {isAcknowledged && showResolutionDetails && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40">
                <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Acknowledgement Details
                </h5>
                <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                  {alert.ackAdmin && (
                    <p>
                      <span className="font-medium text-blue-700 dark:text-blue-300">Acknowledged by:</span> {alert.ackAdmin.name}
                    </p>
                  )}
                  <p className="text-xs text-blue-600/60 dark:text-blue-400/60 mt-2 pt-2 border-t border-blue-100 dark:border-blue-900/40">
                    Acknowledged on {format(new Date(alert.acknowledgedAt!), 'yyyy/MM/dd HH:mm')}
                  </p>
                </div>
              </div>
            )}

            {isResolved && showResolutionDetails && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/40">
                <h5 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  Resolution Details
                </h5>
                <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
                  <p>
                    <span className="font-medium text-green-700 dark:text-green-300">Outcome:</span>{' '}
                    <span className="capitalize">{alert.resolutionType || 'Standard'}</span>
                  </p>
                  {alert.resolutionNote && (
                    <p>
                      <span className="font-medium text-green-700 dark:text-green-300">Note:</span> {alert.resolutionNote}
                    </p>
                  )}
                  {alert.resolverAdmin && (
                    <p>
                      <span className="font-medium text-green-700 dark:text-green-300">Resolved by:</span> {alert.resolverAdmin.name}
                    </p>
                  )}
                  <p className="text-xs text-green-600/60 dark:text-green-400/60 mt-2 pt-2 border-t border-green-100 dark:border-green-900/40">
                    Resolved on {format(new Date(alert.resolvedAt!), 'yyyy/MM/dd HH:mm')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isNeedAttention && (
            <div className="flex items-center gap-3 self-start">
              {!isAcknowledged && !isResolved && (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="px-4 py-2 bg-card border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
                >
                  Acknowledge
                </button>
              )}

              {!isResolved && (
                <button
                  onClick={() => onResolve(alert.id)}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm shadow-green-500/30 transition-all focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
                >
                  Resolve
                </button>
              )}

              {isResolved && (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium text-sm bg-green-50 dark:bg-green-950/20 px-3 py-1 rounded-full border border-green-100 dark:border-green-900/40">
                  <Check className="w-4 h-4" />
                  Resolved
                </span>
              )}

              {isAcknowledged && !isResolved && (
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium text-sm bg-blue-50 dark:bg-blue-950/20 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-900/40">
                  <Eye className="w-4 h-4" />
                  Acknowledged
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
