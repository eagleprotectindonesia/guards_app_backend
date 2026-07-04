'use client';

import { useState, useMemo, useTransition } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { bulkCreateShiftsFromFormAction } from '../actions';
import { Site, ShiftType } from '@prisma/client';
import type { EmployeeSummary } from '@repo/database';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from '../../components/select';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { X, Info, Calendar } from 'lucide-react';
import AddressAutocompleteInput from '@/components/address-autocomplete-input';
import AddressMapPreview from '@/components/address-map-preview';

function getDurationInMins(startTime: string, endTime: string) {
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMins(startTime);
  let end = toMins(endTime);
  if (end < start) end += 24 * 60;
  return end - start;
}

type Props = {
  fixedSites: Serialized<Site>[];
  escortEndSites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  employees: EmployeeSummary[];
  hideEscortSites?: boolean;
};

type AssignmentType = 'site_duty' | 'escort_special' | 'office_control' | 'event_temporary';

export default function ScheduleBuilder({ fixedSites, escortEndSites, shiftTypes, employees, hideEscortSites = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [assignmentType, setAssignmentType] = useState<AssignmentType>('site_duty');
  const [siteId, setSiteId] = useState('');
  const [escortEndSiteId, setEscortEndSiteId] = useState('');
  const [shiftTypeId, setShiftTypeId] = useState('');
  const [guardMode, setGuardMode] = useState<'single' | 'multiple'>('single');
  const [guardIds, setGuardIds] = useState<string[]>([]);
  const [leadGuardId, setLeadGuardId] = useState('');
  const [dateMode, setDateMode] = useState<'single' | 'multiple'>('multiple');
  const [dates, setDates] = useState<string[]>([format(new Date(), 'yyyy-MM-dd')]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [repeatStartDate, setRepeatStartDate] = useState('');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [interval, setInterval] = useState(30);
  const [grace, setGrace] = useState(2);
  const [note, setNote] = useState('');
  const [clientName, setClientName] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [escortEndAddress, setEscortEndAddress] = useState('');
  const [escortEndLat, setEscortEndLat] = useState<number | null>(null);
  const [escortEndLng, setEscortEndLng] = useState<number | null>(null);
  const [flexibleEndTime, setFlexibleEndTime] = useState(true);
  const [autoCreateChatRoom, setAutoCreateChatRoom] = useState(true);
  const [overwrite, setOverwrite] = useState(false);

  const fixedSiteOptions = fixedSites.map(s => ({ value: s.id, label: s.name }));
  const escortEndSiteOptions = escortEndSites.map(s => ({ value: s.id, label: s.name }));
  const employeeOptions = employees.map(e => ({
    value: e.id,
    label: e.fullName,
    employeeNumber: e.employeeNumber || '',
  }));
  const shiftTypeOptions = shiftTypes.map(st => ({
    value: st.id,
    label: `${st.name} (${st.startTime} - ${st.endTime})`,
  }));

  const selectedShiftType = useMemo(
    () => shiftTypes.find(st => st.id === shiftTypeId),
    [shiftTypeId, shiftTypes]
  );

  const shiftTypeDurationMins = useMemo(() => {
    if (!selectedShiftType) return 0;
    return getDurationInMins(selectedShiftType.startTime, selectedShiftType.endTime);
  }, [selectedShiftType]);

  const escortInterval = shiftTypeDurationMins;

  const effectiveDates = useMemo(() => {
    if (!repeatMode || dates.length === 0 || !repeatStartDate || !repeatEndDate) {
      return dates;
    }
    const targetDow = new Set(dates.map(d => new Date(d + 'T00:00:00').getDay()));
    const result: string[] = [];
    const start = new Date(repeatStartDate + 'T00:00:00');
    const end = new Date(repeatEndDate + 'T00:00:00');
    const current = new Date(start);
    while (current <= end) {
      if (targetDow.has(current.getDay())) {
        result.push(format(current, 'yyyy-MM-dd'));
      }
      current.setDate(current.getDate() + 1);
    }
    return result;
  }, [repeatMode, dates, repeatStartDate, repeatEndDate]);

  const selectedEmployees = useMemo(
    () => employees.filter(e => guardIds.includes(e.id)),
    [employees, guardIds]
  );

  const leadGuardOptions = useMemo(
    () => selectedEmployees.map(e => ({ value: e.id, label: e.fullName })),
    [selectedEmployees]
  );

  const previewRows = useMemo(() => {
    const rows: Array<{
      date: string;
      guardId: string;
      guardName: string;
      type: string;
      siteName: string;
      shiftTypeName: string;
      startTime: string;
      endTime: string;
    }> = [];
    for (const date of effectiveDates) {
      for (const gId of guardIds) {
        const emp = employees.find(e => e.id === gId);
        const site = fixedSites.find(s => s.id === siteId);
        let siteName = site?.name || '';
        if (assignmentType === 'escort_special' && hideEscortSites) {
          siteName = startAddress || escortEndAddress || '';
        } else if (!siteName && assignmentType === 'escort_special') {
          siteName = escortEndSites.find(s => s.id === escortEndSiteId)?.name || '';
        }
        rows.push({
          date,
          guardId: gId,
          guardName: emp?.fullName || gId,
          type: assignmentType === 'site_duty' ? 'Site Duty' : 'Escort/Special',
          siteName,
          shiftTypeName: selectedShiftType?.name || '',
          startTime: selectedShiftType?.startTime || '',
          endTime: selectedShiftType?.endTime || '',
        });
      }
    }
    return rows;
  }, [effectiveDates, guardIds, employees, fixedSites, siteId, assignmentType, escortEndSites, escortEndSiteId, selectedShiftType, hideEscortSites, startAddress, escortEndAddress]);

  const totalRowCount = previewRows.length;

  const handleGuardChange = (newValue: unknown) => {
    if (Array.isArray(newValue)) {
      const items = newValue as { value: string }[];
      setGuardIds(items.map(o => o.value));
    } else if (newValue && typeof newValue === 'object' && 'value' in newValue) {
      const item = newValue as { value: string };
      setGuardIds([item.value]);
    } else {
      setGuardIds([]);
    }
  };

  const handleDatePickerChange = (date: Date | null) => {
    if (!date) return;
    const key = format(date, 'yyyy-MM-dd');
    if (dateMode === 'single') {
      setDates([key]);
    } else {
      setDates(prev => prev.includes(key) ? prev : [...prev, key].sort());
    }
  };

  const removeDate = (date: string) => {
    setDates(prev => prev.filter(d => d !== date));
  };

  const handleSubmit = () => {
    if (guardIds.length === 0) {
      toast.error('Please select at least one guard.');
      return;
    }
    if (effectiveDates.length === 0) {
      toast.error('Please select at least one date.');
      return;
    }
    if (!siteId && !(assignmentType === 'escort_special' && hideEscortSites)) {
      toast.error('Please select a site.');
      return;
    }
    if (!shiftTypeId) {
      toast.error('Please select a shift type.');
      return;
    }
    if (assignmentType === 'escort_special' && hideEscortSites) {
      if (!startAddress) {
        toast.error('Please enter the start location address.');
        return;
      }
      if (startLat == null || startLng == null) {
        toast.error('Please enter the start location coordinates.');
        return;
      }
      if (!escortEndAddress) {
        toast.error('Please enter the escort end location address.');
        return;
      }
      if (escortEndLat == null || escortEndLng == null) {
        toast.error('Please enter the escort end location coordinates.');
        return;
      }
    }

    const escortKit = assignmentType === 'escort_special' && hideEscortSites && startAddress && startLat != null && startLng != null
      ? {
          startAddress,
          startLat,
          startLng,
          escortEndAddress,
          escortEndLat: escortEndLat ?? undefined,
          escortEndLng: escortEndLng ?? undefined,
        }
      : assignmentType === 'escort_special'
        ? { escortEndSiteId: escortEndSiteId || undefined }
        : {};

    const combinedNote = assignmentType === 'escort_special' && clientName
      ? `[Client: ${clientName}]${note ? '\n' + note : ''}`
      : note || undefined;

    startTransition(async () => {
      const result = await bulkCreateShiftsFromFormAction({
        kind: assignmentType === 'escort_special' ? 'escort' : 'onsite',
        siteId,
        shiftTypeId,
        employeeIds: guardIds,
        dates: effectiveDates,
        requiredCheckinIntervalMins: assignmentType === 'escort_special' ? escortInterval : interval,
        graceMinutes: grace,
        note: combinedNote || null,
        flexibleEndTime,
        autoCreateChatRoom,
        overwrite,
        clientName: clientName || undefined,
        leadGuardId: leadGuardId || undefined,
        ...escortKit,
      });

      if (result.success) {
        toast.success(result.message);
        router.push('/admin/guard-shifts');
      } else {
        toast.error(result.message);
      }
    });
  };

  const selectableCards: { key: AssignmentType; label: string; description: string; enabled: boolean }[] = [
    { key: 'site_duty', label: 'Site Duty', description: 'Guard at a fixed site location with regular check-ins.', enabled: true },
    { key: 'office_control', label: 'Office Control Duty', description: 'Control room duty at head office.', enabled: false },
    { key: 'escort_special', label: 'Escort / Special Duty', description: 'Escort or special assignment; client may move.', enabled: true },
    { key: 'event_temporary', label: 'Event / Temporary Duty', description: 'Temporary event or short-term assignment.', enabled: false },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Schedule New Guard Shift</h1>
        <Link
          href="/admin/guard-shift-types"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Manage Guard Shift Types
        </Link>
      </div>

      <div className="space-y-6">
        {/* Assignment Type */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Assignment Type</h2>
          <p className="text-sm text-muted-foreground mb-4">Select the type of assignment this guard shift falls under.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {selectableCards.map(card => (
              <button
                key={card.key}
                type="button"
                disabled={!card.enabled}
                onClick={() => setAssignmentType(card.key)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  assignmentType === card.key
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 shadow-sm shadow-red-500/10'
                    : card.enabled
                      ? 'border-border bg-card hover:border-muted-foreground/30'
                      : 'border-border bg-muted/30 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-foreground">{card.label}</span>
                  {!card.enabled && (
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Assignment Details */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Assignment Details</h2>

          {assignmentType === 'site_duty' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="builder-site-id" className="block font-medium text-foreground mb-1">Site</label>
                <Select
                  id="builder-site-id"
                  instanceId="builder-site-id"
                  options={fixedSiteOptions}
                  value={fixedSiteOptions.find(o => o.value === siteId) || null}
                  onChange={option => setSiteId(option?.value || '')}
                  placeholder="Select site..."
                  isClearable
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="builder-interval" className="block font-medium text-foreground mb-1">Check-in Interval (min)</label>
                  <input
                    type="number"
                    id="builder-interval"
                    value={interval}
                    onChange={e => setInterval(Number(e.target.value))}
                    min={5}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="builder-grace" className="block font-medium text-foreground mb-1">Grace Period (min)</label>
                  <input
                    type="number"
                    id="builder-grace"
                    value={grace}
                    onChange={e => setGrace(Number(e.target.value))}
                    min={1}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {assignmentType === 'escort_special' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="builder-client-name" className="block font-medium text-foreground mb-1">Client Name</label>
                <input
                  type="text"
                  id="builder-client-name"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Enter client name..."
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="builder-start-site" className="block font-medium text-foreground mb-1">Start Location</label>
                  {hideEscortSites ? (
                    <div className="space-y-2">
                      <AddressAutocompleteInput
                        value={startAddress}
                        onChange={setStartAddress}
                        onPlaceSelect={(address, lat, lng) => {
                          setStartAddress(address);
                          setStartLat(lat);
                          setStartLng(lng);
                        }}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={startLat ?? ''}
                          onChange={e => setStartLat(e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Latitude"
                          step="any"
                          className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                        />
                        <input
                          type="number"
                          value={startLng ?? ''}
                          onChange={e => setStartLng(e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Longitude"
                          step="any"
                          className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                        />
                      </div>
                      <AddressMapPreview
                        latitude={startLat}
                        longitude={startLng}
                        onLocationChange={(lat, lng) => { setStartLat(lat); setStartLng(lng); }}
                        onAddressChange={setStartAddress}
                      />
                    </div>
                  ) : (
                    <Select
                      id="builder-start-site"
                      instanceId="builder-start-site"
                      options={fixedSiteOptions}
                      value={fixedSiteOptions.find(o => o.value === siteId) || null}
                      onChange={option => setSiteId(option?.value || '')}
                      placeholder="Select start location..."
                      isClearable
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="builder-end-site" className="block font-medium text-foreground mb-1">Expected End Location</label>
                  {hideEscortSites ? (
                    <div className="space-y-2">
                      <AddressAutocompleteInput
                        value={escortEndAddress}
                        onChange={setEscortEndAddress}
                        onPlaceSelect={(address, lat, lng) => {
                          setEscortEndAddress(address);
                          setEscortEndLat(lat);
                          setEscortEndLng(lng);
                        }}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={escortEndLat ?? ''}
                          onChange={e => setEscortEndLat(e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Latitude"
                          step="any"
                          className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                        />
                        <input
                          type="number"
                          value={escortEndLng ?? ''}
                          onChange={e => setEscortEndLng(e.target.value === '' ? null : Number(e.target.value))}
                          placeholder="Longitude"
                          step="any"
                          className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                        />
                      </div>
                      <AddressMapPreview
                        latitude={escortEndLat}
                        longitude={escortEndLng}
                        onLocationChange={(lat, lng) => { setEscortEndLat(lat); setEscortEndLng(lng); }}
                        onAddressChange={setEscortEndAddress}
                      />
                    </div>
                  ) : (
                    <Select
                      id="builder-end-site"
                      instanceId="builder-end-site"
                      options={escortEndSiteOptions}
                      value={escortEndSiteOptions.find(o => o.value === escortEndSiteId) || null}
                      onChange={option => setEscortEndSiteId(option?.value || '')}
                      placeholder="Select end location (optional)..."
                      isClearable
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flexibleEndTime}
                    onChange={e => setFlexibleEndTime(e.target.checked)}
                    className="text-red-600 focus:ring-red-600 rounded"
                  />
                  <span className="text-sm text-foreground">Flexible End Time</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCreateChatRoom}
                    onChange={e => setAutoCreateChatRoom(e.target.checked)}
                    className="text-red-600 focus:ring-red-600 rounded"
                  />
                  <span className="text-sm text-foreground">Auto Create Chat Room</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Guard Shift Type */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Guard Shift Type</h2>
            <Link
              href="/admin/guard-shift-types"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              + Create New Shift Type
            </Link>
          </div>
          <Select
            id="builder-shift-type"
            instanceId="builder-shift-type"
            options={shiftTypeOptions}
            value={shiftTypeOptions.find(o => o.value === shiftTypeId) || null}
            onChange={option => {
              setShiftTypeId(option?.value || '');
            }}
            placeholder="Select guard shift type..."
            isClearable
          />
          {selectedShiftType && (
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Start: <strong className="text-foreground">{selectedShiftType.startTime}</strong></span>
              <span>End: <strong className="text-foreground">{selectedShiftType.endTime}</strong></span>
              <span>Duration: <strong className="text-foreground">{shiftTypeDurationMins} mins</strong></span>
            </div>
          )}
        </div>

        {/* Guard Assignment */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Guard Assignment</h2>

          {guardMode === 'multiple' && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Lead guard is responsible for movement updates in chat.
              </p>
            </div>
          )}

          <div className="flex items-center gap-6 mb-4">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                checked={guardMode === 'single'}
                onChange={() => {
                  setGuardMode('single');
                  setGuardIds(guardIds.slice(0, 1));
                }}
                className="text-red-600 focus:ring-red-600"
              />
              <span className="ml-2 text-foreground text-sm">Single Guard</span>
            </label>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                checked={guardMode === 'multiple'}
                onChange={() => setGuardMode('multiple')}
                className="text-red-600 focus:ring-red-600"
              />
              <span className="ml-2 text-foreground text-sm">Multiple Guards</span>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-medium text-foreground mb-2">Select Guards</label>
              <Select
                id="builder-guards"
                instanceId="builder-guards"
                isMulti={guardMode === 'multiple'}
                options={employeeOptions}
                value={
                  guardMode === 'multiple'
                    ? employeeOptions.filter(o => guardIds.includes(o.value))
                    : employeeOptions.find(o => o.value === guardIds[0]) || null
                }
                onChange={handleGuardChange}
                placeholder="Select guard(s)..."
                isClearable={guardMode !== 'multiple'}
                filterOption={(option, inputValue) => {
                  const search = inputValue.toLowerCase();
                  return (
                    option.data.label.toLowerCase().includes(search) ||
                    option.data.employeeNumber.toLowerCase().includes(search)
                  );
                }}
                formatOptionLabel={(option, { context }) =>
                  context === 'value' ? (
                    <span>{option.label}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{option.label}</span>
                      {option.employeeNumber && <span className="text-muted-foreground">({option.employeeNumber})</span>}
                    </div>
                  )
                }
              />
            </div>

            {guardMode === 'multiple' && guardIds.length > 1 && (
              <div>
                <label htmlFor="builder-lead-guard" className="block font-medium text-foreground mb-1">
                  Lead Guard <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Select
                  id="builder-lead-guard"
                  instanceId="builder-lead-guard"
                  options={leadGuardOptions}
                  value={leadGuardOptions.find(o => o.value === leadGuardId) || null}
                  onChange={option => setLeadGuardId(option?.value || '')}
                  placeholder="Select lead guard..."
                  isClearable
                />
              </div>
            )}
          </div>

          {guardIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Selected: </span>
              {guardIds.map(id => {
                const emp = employees.find(e => e.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  >
                    {emp?.fullName || id}
                    <button
                      type="button"
                      onClick={() => {
                        setGuardIds(prev => prev.filter(g => g !== id));
                        if (leadGuardId === id) setLeadGuardId('');
                      }}
                      className="hover:text-red-800 dark:hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Date Selection */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Date Selection</h2>

          {/* Mode radios */}
          <div className="flex items-center gap-6 mb-4">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                checked={dateMode === 'single'}
                onChange={() => {
                  setDateMode('single');
                  if (dates.length > 1) setDates([dates[0]]);
                }}
                className="text-red-600 focus:ring-red-600"
              />
              <span className="ml-2 text-foreground text-sm">Single Date Only</span>
            </label>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                checked={dateMode === 'multiple'}
                onChange={() => setDateMode('multiple')}
                className="text-red-600 focus:ring-red-600"
              />
              <span className="ml-2 text-foreground text-sm">Add more dates</span>
            </label>
          </div>

          {/* Chip row + calendar icon */}
          <div>
            <label className="block font-medium text-foreground mb-2">Select Dates *</label>
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card min-h-[2.5rem]">
              {dates.length > 0 ? (
                dates.map(date => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    {format(new Date(date + 'T00:00:00'), 'dd MMM yyyy')}
                    <button type="button" onClick={() => removeDate(date)} className="hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No dates selected</span>
              )}
              <DatePicker
                selected={null}
                onChange={handleDatePickerChange}
                customInput={
                  <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </button>
                }
                minDate={new Date()}
                dateFormat="dd MMM yyyy"
                popperPlacement="bottom-end"
              />
            </div>
          </div>

          {/* Repeat Schedule checkbox + range */}
          <div className="mt-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={repeatMode}
                onChange={e => setRepeatMode(e.target.checked)}
                className="text-red-600 focus:ring-red-600 rounded"
              />
              <span className="text-sm font-medium text-foreground">Repeat across a date range</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Repeats the weekdays of the selected dates every week between a start and end date.
            </p>
            {repeatMode && (
              <div className="mt-3 ml-6 space-y-3">
                {dates.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Repeating weekdays of: {dates.map(d => format(new Date(d + 'T00:00:00'), 'dd MMM yyyy')).join(', ')}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
                    <DatePicker
                      selected={repeatStartDate ? new Date(repeatStartDate + 'T00:00:00') : null}
                      onChange={(date: Date | null) => {
                        if (date) setRepeatStartDate(format(date, 'yyyy-MM-dd'));
                      }}
                      customInput={
                        <button type="button" className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{repeatStartDate ? format(new Date(repeatStartDate + 'T00:00:00'), 'dd MMM yyyy') : 'Start date'}</span>
                        </button>
                      }
                      minDate={new Date()}
                      dateFormat="dd MMM yyyy"
                      popperPlacement="bottom-start"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
                    <DatePicker
                      selected={repeatEndDate ? new Date(repeatEndDate + 'T00:00:00') : null}
                      onChange={(date: Date | null) => {
                        if (date) setRepeatEndDate(format(date, 'yyyy-MM-dd'));
                      }}
                      customInput={
                        <button type="button" className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{repeatEndDate ? format(new Date(repeatEndDate + 'T00:00:00'), 'dd MMM yyyy') : 'End date'}</span>
                        </button>
                      }
                      minDate={repeatStartDate ? new Date(repeatStartDate + 'T00:00:00') : new Date()}
                      dateFormat="dd MMM yyyy"
                      popperPlacement="bottom-start"
                    />
                  </div>
                </div>
                {effectiveDates.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Generates <strong>{effectiveDates.length} date(s)</strong> across the range
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Notes</h2>
          <p className="text-sm text-muted-foreground mb-3">Optional instructions or notes for this assignment.</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground/50"
            placeholder="Add any special instructions or notes..."
          />
        </div>

        {/* Overwrite Toggle */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={e => setOverwrite(e.target.checked)}
              className="text-red-600 focus:ring-red-600 rounded"
            />
            <span className="text-sm font-medium text-foreground">Overwrite existing shifts on same dates</span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            When enabled, any existing shift for the same guard on the same date will be deleted before creating the new one.
          </p>
        </div>

        {/* Schedule Preview */}
        {totalRowCount > 0 && (
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Schedule Preview</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Date</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Assignment</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Type</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Guard</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Shift Type</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">Start</th>
                    <th className="py-2 px-3 text-xs font-bold text-muted-foreground uppercase">End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="py-2 px-3 text-foreground">{row.date}</td>
                      <td className="py-2 px-3 text-muted-foreground">{row.siteName}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.type === 'Escort/Special'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-foreground font-medium">{row.guardName}</td>
                      <td className="py-2 px-3 text-muted-foreground">{row.shiftTypeName}</td>
                      <td className="py-2 px-3 text-muted-foreground">{row.startTime}</td>
                      <td className="py-2 px-3 text-muted-foreground">{row.endTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Total: <strong>{totalRowCount} schedule(s)</strong> will be created
                ({selectedEmployees.length} guard{selectedEmployees.length !== 1 ? 's' : ''} &times; {dates.length} date{dates.length !== 1 ? 's' : ''})
                and {totalRowCount} attendance record{totalRowCount !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/guard-shifts')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || guardIds.length === 0 || dates.length === 0 || !siteId || !shiftTypeId}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Creating...' : `Create ${totalRowCount} Schedule${totalRowCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
