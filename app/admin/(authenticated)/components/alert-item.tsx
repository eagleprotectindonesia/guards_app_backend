'use client';

import { Alert, Shift, Site, Guard, ShiftType, Admin } from '@prisma/client';
import { Serialized } from '@/lib/utils';

// Define types locally or import if shared (duplicating for now to ensure self-containment)
type GuardWithOptionalRelations = Serialized<Guard>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;
type AdminWithOptionalRelations = Serialized<Admin>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  guard?: GuardWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  resolverAdmin?: AdminWithOptionalRelations | null;
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

  return (
    <div
      className={`group relative overflow-hidden bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
        isResolved
          ? 'border-gray-100 opacity-60 bg-gray-50'
          : isCritical
          ? 'border-l-4 border-l-red-500 border-y-red-100 border-r-red-100'
          : 'border-l-4 border-l-orange-400 border-y-orange-100 border-r-orange-100'
      }`}
    >
      <div className="p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                  isCritical ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                }`}
              >
                {alert.reason.replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {new Date(alert.windowStart).toLocaleTimeString()}
              </span>
            </div>

            <h4 className="text-lg font-medium text-gray-900 mb-1">{alert.site?.name}</h4>
            <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {alert.shift?.guard?.name || 'Unassigned Guard'}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {alert.shift?.shiftType?.name}
              </span>
            </div>

            {isResolved && showResolutionDetails && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <h5 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Resolution Details
                </h5>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    <span className="font-medium text-gray-700">Outcome:</span>{' '}
                    <span className="capitalize">{alert.resolutionType || 'Standard'}</span>
                  </p>
                  {alert.resolutionNote && (
                    <p>
                      <span className="font-medium text-gray-700">Note:</span> {alert.resolutionNote}
                    </p>
                  )}
                  {alert.resolverAdmin && (
                     <p>
                        <span className="font-medium text-gray-700">Resolved by:</span> {alert.resolverAdmin.name}
                     </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">
                    Resolved on {new Date(alert.resolvedAt!).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 self-start">
            {!isAcknowledged && !isResolved && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="px-4 py-2 bg-white border border-blue-200 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"
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
              <span className="flex items-center gap-1.5 text-green-600 font-medium text-sm bg-green-50 px-3 py-1 rounded-full border border-green-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Resolved
              </span>
            )}
            
            {isAcknowledged && !isResolved && (
              <span className="flex items-center gap-1.5 text-blue-600 font-medium text-sm bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                Acknowledged
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
