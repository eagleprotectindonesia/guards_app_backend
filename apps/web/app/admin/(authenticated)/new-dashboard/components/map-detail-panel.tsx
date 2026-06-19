'use client';

import { useEffect } from 'react';
import { X, Pencil, MapPin, ShieldCheck, ShieldAlert, Clock, ShieldOff, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanicAlert } from '@repo/types';
import { MapSite } from './sites-map-card';

export type SelectedMapItem =
  | { kind: 'site'; site: MapSite; editHref: string | null }
  | { kind: 'panic'; panic: PanicAlert };

type MapDetailPanelProps = {
  selectedItem: SelectedMapItem;
  onClose: () => void;
  onNavigate?: (href: string) => void;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtTimeRange(from: string, to: string) {
  return `${fmtTime(from)} - ${fmtTime(to)}`;
}

function fmtStartsIn(minutes: number) {
  if (minutes < 1) return '<1 min';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes} min`;
}

type StatusConfig = {
  label: string;
  badgeClass: string;
  iconClass: string;
  sectionTitle: string;
  icon: typeof ShieldCheck;
};

const STATUS_CONFIG: Record<MapSite['markerStatus'], StatusConfig> = {
  active: {
    label: 'ACTIVE NOW',
    badgeClass: 'bg-green-500/15 text-green-600 dark:text-green-400',
    iconClass: 'bg-green-500/10 text-green-600 dark:text-green-400',
    sectionTitle: 'GUARDS ON SHIFT',
    icon: ShieldCheck,
  },
  late: {
    label: 'ACTION NEEDED',
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    iconClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    sectionTitle: 'GUARDS ON SHIFT',
    icon: ShieldAlert,
  },
  pending: {
    label: 'PENDING',
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    iconClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    sectionTitle: 'GUARDS ON SHIFT',
    icon: ShieldAlert,
  },
  upcoming: {
    label: 'UPCOMING',
    badgeClass: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    iconClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    sectionTitle: 'UPCOMING SHIFTS',
    icon: Clock,
  },
  none: {
    label: 'NO SHIFT',
    badgeClass: 'bg-gray-500/15 text-gray-500 dark:text-gray-400',
    iconClass: 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
    sectionTitle: 'NEXT SHIFT',
    icon: ShieldOff,
  },
};

function SiteDetailContent({ site, editHref, onNavigate }: { site: MapSite; editHref: string | null; onNavigate?: (href: string) => void }) {
  const config = STATUS_CONFIG[site.markerStatus];
  const StatusIcon = config.icon;

  const firstShift = site.shifts.length > 0 ? site.shifts[0] : null;
  const firstUpcoming = site.upcoming.length > 0 ? site.upcoming[0] : null;

  const shiftTimeRange = firstShift
    ? fmtTimeRange(firstShift.shiftStartsAt, firstShift.shiftEndsAt)
    : firstUpcoming
      ? fmtTimeRange(firstUpcoming.shiftStartsAt, firstUpcoming.shiftEndsAt)
      : '—';

  const showGuards =
    (site.markerStatus === 'active' || site.markerStatus === 'late' || site.markerStatus === 'pending') &&
    site.shifts.length > 0;

  const showUpcoming = site.markerStatus === 'upcoming' && site.upcoming.length > 0;

  const showNextShift = site.markerStatus === 'none' && site.upcoming.length > 0;

  return (
    <>
      {/* Status badge */}
      <div className="mb-4">
        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badgeClass}`}>
          {config.label}
        </span>
      </div>

      {/* Site name with icon */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${config.iconClass}`}>
          <StatusIcon className="h-5 w-5" />
        </div>
        <p className="font-bold text-base text-foreground">{site.name}</p>
      </div>

      {/* Site info rows */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-xs mb-4 items-baseline">
        {site.clientName && (
          <div className="contents">
            <span className="text-muted-foreground">Client</span>
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              {site.clientName}
            </span>
          </div>
        )}
        {site.address && (
          <div className="contents">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium text-foreground flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{site.address}</span>
            </span>
          </div>
        )}
        <div className="contents">
          <span className="text-muted-foreground">Shift Time</span>
          <span className="font-medium text-foreground flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            {shiftTimeRange}
          </span>
        </div>
      </div>

      {/* Guards / Shifts section */}
      {(showGuards || showUpcoming || showNextShift) && (
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-3">
            {showNextShift ? 'NEXT SHIFT' : config.sectionTitle}
          </p>
          <div className="space-y-2">
            {showGuards &&
              site.shifts.map((s, i) => (
                <div key={i} className="rounded-lg bg-muted/20 p-2.5 space-y-1.5">
                  <p className="font-semibold text-sm text-foreground">
                    {s.employeeName}
                    {s.employeeNumber && <span className="font-normal text-muted-foreground ml-1.5">{s.employeeNumber}</span>}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Attendance</span>
                    <span className={s.isPresent ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {s.isPresent ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last check-in</span>
                    <span className="font-medium text-foreground">
                      {s.lastCheckinAt ? fmtTime(s.lastCheckinAt) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            {showUpcoming &&
              site.upcoming.map((u, i) => (
                <div key={i} className="rounded-lg bg-muted/20 p-2.5 space-y-1.5">
                  <p className="font-semibold text-sm text-foreground">
                    {u.employeeName}
                    {u.employeeNumber && <span className="font-normal text-muted-foreground ml-1.5">{u.employeeNumber}</span>}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Shift</span>
                    <span className="font-medium text-foreground">{fmtTimeRange(u.shiftStartsAt, u.shiftEndsAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Starts in</span>
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">{fmtStartsIn(u.startsInMinutes)}</span>
                  </div>
                </div>
              ))}
            {showNextShift &&
              site.upcoming.map((u, i) => (
                <div key={i} className="rounded-lg bg-muted/20 p-2.5 space-y-1.5">
                  <p className="font-semibold text-sm text-foreground">
                    {u.employeeName}
                    {u.employeeNumber && <span className="font-normal text-muted-foreground ml-1.5">{u.employeeNumber}</span>}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Shift</span>
                    <span className="font-medium text-foreground">{fmtTimeRange(u.shiftStartsAt, u.shiftEndsAt)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {!showGuards && !showUpcoming && !showNextShift && site.markerStatus === 'none' && (
        <p className="text-xs text-muted-foreground italic">No scheduled shifts in the next 24 hours.</p>
      )}

      {/* Edit button */}
      {editHref && onNavigate && (
        <div className="mt-4 pt-3 border-t border-border">
          <button
            onClick={() => onNavigate(editHref)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit site
          </button>
        </div>
      )}
    </>
  );
}

function PanicDetailContent({ panic }: { panic: PanicAlert }) {
  return (
    <>
      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-4">
        <MapPin className="h-4 w-4" />
        <span className="font-bold text-xs uppercase tracking-wider">SOS ALERT</span>
      </div>
      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Client</span>
          <span className="font-medium text-foreground">{`${panic.firstName} ${panic.lastName}`}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="font-medium text-foreground">{panic.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Time</span>
          <span className="font-medium text-foreground">{new Date(panic.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Coordinates</span>
          <span className="font-medium text-foreground">{`${panic.latitude.toFixed(4)}, ${panic.longitude.toFixed(4)}`}</span>
        </div>
      </div>
    </>
  );
}

export function MapDetailPanel({ selectedItem, onClose, onNavigate }: MapDetailPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {selectedItem.kind === 'site' ? 'SITE DETAILS' : 'SOS DETAILS'}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {selectedItem.kind === 'site' ? (
        <SiteDetailContent site={selectedItem.site} editHref={selectedItem.editHref} onNavigate={onNavigate} />
      ) : (
        <PanicDetailContent panic={selectedItem.panic} />
      )}
    </div>
  );
}
