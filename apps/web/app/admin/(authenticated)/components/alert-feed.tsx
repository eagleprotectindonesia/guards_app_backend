'use client';

import { useState } from 'react';
import { Alert, Shift, Site, Guard, ShiftType, Admin } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import AlertItem from './alert-item';
import AlertResolutionModal from './alert-resolution-modal';
import { Check } from 'lucide-react';

type GuardWithOptionalRelations = Serialized<Guard>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;
type AdminWithOptionalRelations = Serialized<Admin>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  guard?: GuardWithOptionalRelations | null;
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
  onResolve: (alertId: string, resolutionData?: { outcome: string; note: string }) => void;
  showSiteFilter?: boolean;
  selectedSiteId?: string;
  onSiteSelect?: (siteId: string) => void;
  showResolutionDetails?: boolean;
};

export default function AlertFeed({
  alerts,
  onAcknowledge,
  onResolve,
  showSiteFilter = false,
  selectedSiteId,
  onSiteSelect,
  showResolutionDetails = false,
}: AlertFeedProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'attendance' | 'checkin'>('all');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

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
    return true;
  });

  const handleConfirmResolution = async (outcome: 'resolve' | 'forgive', note: string) => {
    if (!selectedAlertId) return;

    try {
      const body = { outcome, note };
      await fetch(`/api/admin/alerts/${selectedAlertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      onResolve(selectedAlertId, { outcome, note }); // Notify parent component of resolution

      setSelectedAlertId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/acknowledge`, { method: 'POST' });
      onAcknowledge(alertId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Alert Feed</h2>
        {showSiteFilter && selectedSiteId && onSiteSelect && (
          <button onClick={() => onSiteSelect('')} className="text-sm text-blue-600 hover:text-blue-800">
            View All Sites
          </button>
        )}
      </div>

      {/* Alert Type Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'all'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('all')}
        >
          All ({alerts.length})
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'attendance'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('attendance')}
        >
          Attendance ({alerts.filter(a => a.reason === 'missed_attendance').length})
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'checkin'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('checkin')}
        >
          Check-in ({alerts.filter(a => a.reason === 'missed_checkin').length})
        </button>
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">All Clear</h3>
          <p className="text-gray-500">No active alerts at the moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onResolve={() => setSelectedAlertId(alert.id)} // Internal handler to open modal
              showResolutionDetails={showResolutionDetails}
            />
          ))}
        </div>
      )}

      <AlertResolutionModal
        isOpen={!!selectedAlertId}
        onClose={() => setSelectedAlertId(null)}
        onConfirm={handleConfirmResolution}
        alertType={alerts.find(a => a.id === selectedAlertId)?.reason}
      />
    </>
  );
}
