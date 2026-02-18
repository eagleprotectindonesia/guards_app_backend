'use client';

import { useState } from 'react';
import { Alert, Shift, Site, ShiftType, Admin } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { Serialized } from '@/lib/utils';
import AlertItem from './alert-item';
import { Check } from 'lucide-react';
import { useSession } from '../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type EmployeeWithOptionalRelations = Serialized<EmployeeWithRelations>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;
type AdminWithOptionalRelations = Serialized<Admin>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: EmployeeWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

export type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  resolverAdmin?: AdminWithOptionalRelations | null;
  ackAdmin?: AdminWithOptionalRelations | null;
  status?: string;
};

type AlertFeedProps = {
  alerts: AlertWithRelations[];
  onAcknowledge: (alertId: string) => Promise<void>;
  showSiteFilter?: boolean;
  selectedSiteId?: string;
  onSiteSelect?: (siteId: string) => void;
  showResolutionDetails?: boolean;
  totalCounts?: {
    attendance: number;
    checkin: number;
    security: number;
  };
};

export default function AlertFeed({
  alerts,
  onAcknowledge,
  showSiteFilter = false,
  selectedSiteId,
  onSiteSelect,
  showResolutionDetails = false,
  totalCounts,
}: AlertFeedProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'attendance' | 'checkin' | 'security'>('all');
  const { hasPermission } = useSession();

  if (!hasPermission(PERMISSIONS.ALERTS.VIEW)) {
    return null;
  }

  const filteredAlerts = alerts.filter(alert => {
    if (activeTab === 'all') {
      return true;
    }
    if (activeTab === 'attendance') {
      return alert.reason === 'missed_attendance';
    }
    if (activeTab === 'checkin') {
      return alert.reason === 'missed_checkin';
    }
    if (activeTab === 'security') {
      return alert.reason === 'geofence_breach' || alert.reason === 'location_services_disabled';
    }
    return true;
  });

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/acknowledge`, { method: 'POST' });
      onAcknowledge(alertId);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper to get count for a tab
  const getTabCount = (type: 'all' | 'attendance' | 'checkin' | 'security') => {
    if (totalCounts) {
      if (type === 'all') return totalCounts.attendance + totalCounts.checkin + totalCounts.security;
      return totalCounts[type];
    }
    // Fallback to local filtering (Dashboard behavior)
    if (type === 'all') return alerts.length;
    if (type === 'attendance') return alerts.filter(a => a.reason === 'missed_attendance').length;
    if (type === 'checkin') return alerts.filter(a => a.reason === 'missed_checkin').length;
    if (type === 'security')
      return alerts.filter(a => a.reason === 'geofence_breach' || a.reason === 'location_services_disabled').length;
    return 0;
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Alert Feed</h2>
        {showSiteFilter && selectedSiteId && onSiteSelect && (
          <button
            onClick={() => onSiteSelect('')}
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
          >
            View All Sites
          </button>
        )}
      </div>

      {/* Alert Type Tabs */}
      <div className="flex border-b border-border mb-4">
        <button
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('all')}
        >
          All ({getTabCount('all')})
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'attendance'
              ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('attendance')}
        >
          Attendance ({getTabCount('attendance')})
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'checkin'
              ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('checkin')}
        >
          Check-in ({getTabCount('checkin')})
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'security'
              ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('security')}
        >
          Security ({getTabCount('security')})
        </button>
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-foreground">All Clear</h3>
          <p className="text-muted-foreground">No active alerts at the moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              showResolutionDetails={showResolutionDetails}
            />
          ))}
        </div>
      )}
    </>
  );
}
