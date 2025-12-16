'use client';

import { Alert, Shift, Site, Guard, ShiftType, Admin } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { Check, CheckCircle, Clock, Eye, User } from 'lucide-react';
import Link from 'next/link';

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
      className={`group relative overflow-hidden bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
        isResolved
          ? 'border-gray-100 opacity-60 bg-gray-50'
          : isCritical
          ? 'border-l-4 border-l-red-500 border-y-red-100 border-r-red-100'
          : isNeedAttention
          ? 'border-l-4 border-l-yellow-400 border-y-yellow-100 border-r-yellow-100'
          : 'border-l-4 border-l-orange-400 border-y-orange-100 border-r-orange-100'
      }`}
    >
      <div className="p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                  isCritical
                    ? 'bg-red-100 text-red-800'
                    : isNeedAttention
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-orange-100 text-orange-800'
                }`}
              >
                {isNeedAttention ? 'ATTENTION NEEDED' : alert.reason.replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {new Date(alert.windowStart).toLocaleTimeString()}
              </span>
            </div>

            <h4 className="text-lg font-medium text-gray-900 mb-1">{alert.site?.name}</h4>
            <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4 text-gray-400" />
                {alert.shift?.guard ? (
                  <Link
                    href={`/admin/guards/${alert.shift.guard.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {alert.shift.guard.name}
                  </Link>
                ) : (
                  'Unassigned Guard'
                )}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-gray-400" />
                {alert.shift?.shiftType?.name}
              </span>
            </div>

            {isAcknowledged && showResolutionDetails && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <h5 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Acknowledgement Details
                </h5>
                <div className="text-sm text-blue-600 space-y-1">
                  {alert.ackAdmin && (
                    <p>
                      <span className="font-medium text-blue-700">Acknowledged by:</span> {alert.ackAdmin.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">
                    Acknowledged on {new Date(alert.acknowledgedAt!).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {isResolved && showResolutionDetails && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <h5 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
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

          {!isNeedAttention && (
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
                  <Check className="w-4 h-4" />
                  Resolved
                </span>
              )}

              {isAcknowledged && !isResolved && (
                <span className="flex items-center gap-1.5 text-blue-600 font-medium text-sm bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
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
