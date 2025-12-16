'use client';

import { useState, useEffect } from 'react';
import { Site } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import AlarmInterface from './components/alarm-interface';
import AlertFeed from '../components/alert-feed';
import Select from '../components/select';
import { useAlerts } from '../context/alert-context';

type SiteWithOptionalRelations = Serialized<Site>;

export default function AdminDashboard() {
  const [sites, setSites] = useState<SiteWithOptionalRelations[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(''); // Empty string = All Sites

  const {
    alerts: allAlerts,
    activeSites: allActiveSites,
    upcomingShifts: allUpcomingShifts,
    connectionStatus,
    acknowledgeAlert,
    resolveAlert,
  } = useAlerts();

  // Fetch all sites for the dropdown (static list)
  useEffect(() => {
    fetch('/api/admin/sites')
      .then(res => res.json())
      .then((data: SiteWithOptionalRelations[]) => {
        if (Array.isArray(data)) setSites(data);
      });
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    acknowledgeAlert(alertId);
  };

  const handleResolve = (alertId: string) => {
    resolveAlert(alertId);
  };

  const siteOptions = [
    { value: '', label: 'All Sites' },
    ...sites.map(s => ({ value: s.id, label: s.name })).slice(0, 8),
  ];

  // Client-side filtering
  const alerts = selectedSiteId ? allAlerts.filter(a => a.site?.id === selectedSiteId) : allAlerts;

  const activeSites = selectedSiteId ? allActiveSites.filter(as => as.site.id === selectedSiteId) : allActiveSites;

  const upcomingShifts = selectedSiteId
    ? allUpcomingShifts.filter(us => us.site.id === selectedSiteId)
    : allUpcomingShifts;

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Dashboard</h1>
          <p className="text-sm text-gray-500">Real-time monitoring of guards and alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'Connected'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {connectionStatus}
          </div>

          <Select
            options={siteOptions}
            value={siteOptions.find(opt => opt.value === selectedSiteId) || null}
            onChange={option => setSelectedSiteId(option?.value || '')}
            placeholder="All Sites"
            isClearable={false}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        {/* Left Column: Active Sites / Stats */}
        <div className="space-y-6">
          {/* Stats Card */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <div className="text-2xl font-bold text-red-700">
                  {alerts.filter(a => a.status !== 'need_attention').length}
                </div>
                <div className="text-xs text-red-600 font-medium">Active Alerts</div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="text-2xl font-bold text-blue-700">{activeSites.length}</div>
                <div className="text-xs text-blue-600 font-medium">Active Sites</div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg border border-green-100 col-span-2">
                <div className="text-2xl font-bold text-green-700">
                  {activeSites.reduce(
                    (acc, site) =>
                      acc +
                      site.shifts.filter(
                        s => s.guard && s.attendance && s.attendance.status !== 'absent'
                      ).length,
                    0
                  )}
                </div>
                <div className="text-xs text-green-600 font-medium">Active Guards</div>
              </div>
            </div>
          </div>

          {/* Active Sites List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Active Shifts</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[calc(100vh-400px)] overflow-y-auto">
              {activeSites.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-500">No active shifts right now.</p>
                </div>
              ) : (
                activeSites.map(({ site, shifts }) => (
                  <div key={site.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{site.name}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {shifts.length} Active
                      </span>
                    </div>
                    <div className="space-y-2">
                      {shifts.map(shift => (
                        <div key={shift.id} className="text-xs text-gray-600 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                          <span className="truncate">
                            {shift.guard?.name || 'Unassigned'}
                            <span className="text-gray-400"> ({shift.shiftType?.name})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* New Card: Upcoming Shifts */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Upcoming (24h)</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
              {upcomingShifts.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-500">No upcoming shifts.</p>
                </div>
              ) : (
                upcomingShifts.map(shift => (
                  <div key={shift.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="font-medium text-gray-900 text-sm truncate max-w-[150px]"
                        title={shift.site?.name}
                      >
                        {shift.site?.name}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {new Date(shift.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${shift.guard ? 'bg-blue-400' : 'bg-red-400'}`}></div>
                      <span className="truncate">
                        {shift.guard?.name || 'Unassigned'}
                        <span className="text-gray-400"> ({shift.shiftType?.name})</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Column: Alerts Feed */}
        <div className="col-span-1 lg:col-span-3 space-y-4">
          <AlarmInterface alerts={alerts} />
          {/* <AlertMap alerts={alerts} /> */}
          <AlertFeed
            alerts={alerts}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
            showSiteFilter={true}
            selectedSiteId={selectedSiteId}
            onSiteSelect={setSelectedSiteId}
            showResolutionDetails={false}
          />
        </div>
      </div>
    </div>
  );
}
