'use client';

import { useState } from 'react';
import { Site } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import AlarmInterface from './components/alarm-interface';
import AlertFeed from '../components/alert-feed';
import Select from '../components/select';
import { useAlerts } from '../context/alert-context';

export const dynamic = 'force-dynamic';

type SiteWithOptionalRelations = Serialized<Site>;

export default function AdminDashboard({ initialSites }: { initialSites: SiteWithOptionalRelations[] }) {
  const [sites] = useState<SiteWithOptionalRelations[]>(initialSites);
  const [selectedSiteId, setSelectedSiteId] = useState(''); // Empty string = All Sites

  const {
    alerts: allAlerts,
    activeSites: allActiveSites,
    upcomingShifts: allUpcomingShifts,
    connectionStatus,
    isInitialized,
    acknowledgeAlert,
  } = useAlerts();

  if (!isInitialized) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-semibold mb-2">Connecting to Live Stream</h2>
        <p className="text-muted-foreground max-w-xs">
          Please wait while we establish a secure connection and sync real-time data...
        </p>
      </div>
    );
  }

  const handleAcknowledge = async (alertId: string) => {
    acknowledgeAlert(alertId);
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
      <header className="mb-6 flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time monitoring of employees and alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'Connected'
                ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400'
                : 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400'
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
          <div className="bg-card p-5 rounded-xl shadow-sm border border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {alerts.filter(a => a.status !== 'need_attention').length}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 font-medium">Active Alerts</div>
              </div>
              <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{activeSites.length}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Active Sites</div>
              </div>
              <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/20 col-span-2">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {activeSites.reduce(
                    (acc, site) =>
                      acc +
                      site.shifts.filter(s => s.employee && s.attendance && s.attendance.status !== 'absent').length,
                    0
                  )}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 font-medium">Active Employees</div>
              </div>
            </div>
          </div>

          {/* Active Sites List */}
          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-foreground">Active Shifts</h3>
            </div>
            <div className="divide-y divide-border max-h-[calc(100vh-400px)] overflow-y-auto">
              {activeSites.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No active shifts right now.</p>
                </div>
              ) : (
                activeSites.map(({ site, shifts }) => (
                  <div key={site.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground">{site.name}</span>
                      <span className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                        {shifts.length} Active
                      </span>
                    </div>
                    <div className="space-y-2">
                      {shifts.map(shift => (
                        <div key={shift.id} className="text-xs text-muted-foreground flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          <span className="truncate">
                            {shift.employee?.fullName || 'Unassigned'}
                            <span className="text-muted-foreground/60"> ({shift.shiftType?.name})</span>
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
          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-foreground">Upcoming (24h)</h3>
            </div>
            <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
              {upcomingShifts.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No upcoming shifts.</p>
                </div>
              ) : (
                upcomingShifts.map(shift => (
                  <div key={shift.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="font-medium text-foreground text-sm truncate max-w-[150px]"
                        title={shift.site?.name}
                      >
                        {shift.site?.name}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(shift.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${shift.employee ? 'bg-blue-400' : 'bg-red-400'}`}
                      ></div>
                      <span className="truncate">
                        {shift.employee?.fullName || 'Unassigned'}
                        <span className="text-muted-foreground/60"> ({shift.shiftType?.name})</span>
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
