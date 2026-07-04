'use client';

import type { Serialized } from '@/lib/server-utils';
import { createShift, updateShift } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateShiftInput } from '@repo/validations';
import { useActionState, useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Shift, Site, ShiftType } from '@prisma/client';
import type { EmployeeSummary } from '@repo/database';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from '../../components/select';
import { Select as RadixSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
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
  shift?: Serialized<Shift>;
  fixedSites: Serialized<Site>[];
  escortEndSites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  employees: EmployeeSummary[];
  hideEscortSites?: boolean;
};

export default function ShiftForm({ shift, fixedSites, escortEndSites, shiftTypes, employees, hideEscortSites = false }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateShiftInput>, FormData>(
    shift ? updateShift.bind(null, shift.id) : createShift,
    { success: false }
  );

  const [date, setDate] = useState<Date | null>(shift?.date ? new Date(shift.date) : new Date());
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>(shift?.shiftTypeId || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(shift?.siteId || '');
  const [selectedemployeeId, setSelectedemployeeId] = useState<string>(shift?.employeeId || '');
  const [selectedKind, setSelectedKind] = useState<'onsite' | 'escort' | 'office_control' | 'event_temporary'>(shift?.kind || 'onsite');
  const [selectedEscortEndSiteId, setSelectedEscortEndSiteId] = useState<string>(shift?.escortEndSiteId || '');
  const eventInitialSite = shift?.kind === 'event_temporary' && shift?.siteId
    ? fixedSites.find(s => s.id === shift.siteId)
    : null;

  const [startAddress, setStartAddress] = useState(eventInitialSite?.address || '');
  const [startLat, setStartLat] = useState<number | null>(eventInitialSite?.latitude ?? null);
  const [startLng, setStartLng] = useState<number | null>(eventInitialSite?.longitude ?? null);
  const [escortEndAddress, setEscortEndAddress] = useState('');
  const [escortEndLat, setEscortEndLat] = useState<number | null>(null);
  const [escortEndLng, setEscortEndLng] = useState<number | null>(null);

  const parseInitialEvent = () => {
    if (shift?.kind !== 'event_temporary' || !shift?.note) return { eventName: '', eventType: '', clientNote: '' };
    const match = shift.note.match(/^\[(.*?) Event\]\s*(.+?)(?:\n(.*))?$/s);
    if (match) return { eventType: match[1], eventName: match[2], clientNote: match[3] || '' };
    return { eventName: '', eventType: '', clientNote: shift.note };
  };
  const initialEvent = parseInitialEvent();
  const [eventName, setEventName] = useState(initialEvent.eventName);
  const [eventType, setEventType] = useState(initialEvent.eventType);
  const [clientNote, setClientNote] = useState(initialEvent.clientNote);

  const isReadOnly = shift ? shift.status !== 'scheduled' : false;
  const groupShiftId = shift?.groupShiftId;
  const isGroupLocked = !!groupShiftId;

  const shiftTypeDurationMins = useMemo(() => {
    const st = shiftTypes.find(st => st.id === selectedShiftTypeId);
    if (!st) return 0;
    return getDurationInMins(st.startTime, st.endTime);
  }, [selectedShiftTypeId, shiftTypes]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shift ? 'Guard shift updated successfully!' : 'Guard shift created successfully!'));
      router.push('/admin/guard-shifts');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, shift, router]);

  const fixedSiteOptions = fixedSites.map(site => ({ value: site.id, label: site.name }));
  const escortEndSiteOptions = escortEndSites.map(site => ({ value: site.id, label: site.name }));
  const employeeOptions = employees.map(employee => ({
    value: employee.id,
    label: employee.fullName,
    employeeNumber: employee.employeeNumber ?? '',
  }));
  const shiftTypeOptions = shiftTypes.map(st => ({
    value: st.id,
    label: `${st.name} (${st.startTime} - ${st.endTime})`,
  }));

  const handleKindChange = (kind: 'onsite' | 'escort' | 'office_control' | 'event_temporary') => {
    setSelectedKind(kind);
    if (kind !== 'escort') {
      setSelectedEscortEndSiteId('');
    }
  };

  const currentShiftSiteName = fixedSites.find(s => s.id === (shift?.siteId || ''))?.name || shift?.siteId;
  const currentEscortEndSiteName = shift?.escortEndSiteId
    ? escortEndSites.find(s => s.id === shift.escortEndSiteId)?.name || shift.escortEndSiteId
    : null;

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {isReadOnly ? 'View Guard Shift' : shift ? 'Edit Guard Shift' : 'Schedule New Guard Shift'}
      </h1>
      {isGroupLocked && (
        <div className="mb-6 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm flex items-center justify-between">
          <span>This shift belongs to a group. Site, date, shift type, and timing are managed at the group level.</span>
          <Link
            href={`/admin/guard-shifts/group-shifts/${groupShiftId}`}
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium shrink-0"
          >
            <ExternalLink size={14} />
            View Group Shift
          </Link>
        </div>
      )}
      <form action={formAction} className="space-y-8">
        {/* Kind Field */}
        <div>
          <label className="block font-medium text-foreground mb-2">Shift Type</label>
          {(isReadOnly || isGroupLocked) ? (
            <p className="text-sm text-foreground capitalize">{shift?.kind || 'onsite'}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value="onsite"
                  checked={selectedKind === 'onsite'}
                  onChange={() => handleKindChange('onsite')}
                  className="text-red-600 focus:ring-red-600"
                />
                <span className="ml-2 text-foreground text-sm">On-site</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value="office_control"
                  checked={selectedKind === 'office_control'}
                  onChange={() => handleKindChange('office_control')}
                  className="text-red-600 focus:ring-red-600"
                />
                <span className="ml-2 text-foreground text-sm">Office Control</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value="event_temporary"
                  checked={selectedKind === 'event_temporary'}
                  onChange={() => handleKindChange('event_temporary')}
                  className="text-red-600 focus:ring-red-600"
                />
                <span className="ml-2 text-foreground text-sm">Event / Temporary</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value="escort"
                  checked={selectedKind === 'escort'}
                  onChange={() => handleKindChange('escort')}
                  className="text-red-600 focus:ring-red-600"
                />
                <span className="ml-2 text-foreground text-sm">Escort</span>
              </label>
            </div>
          )}
          {state.errors?.kind && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.kind[0]}</p>
          )}
        </div>

        {/* Site Field */}
        <div>
          <label className="block font-medium text-foreground mb-1">
            {selectedKind === 'event_temporary' ? 'Event Details' : 'Site'}
          </label>
          {(isReadOnly || isGroupLocked) ? (
            <p className="text-sm text-foreground">{currentShiftSiteName}</p>
          ) : selectedKind === 'event_temporary' ? (
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-foreground mb-1">Event Name</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="Enter event name..."
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground mb-1">Event Type</label>
                <RadixSelect value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select event type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Wedding">Wedding</SelectItem>
                    <SelectItem value="Private Event">Private Event</SelectItem>
                    <SelectItem value="Temporary Villa Security">Temporary Villa Security</SelectItem>
                    <SelectItem value="Festival">Festival</SelectItem>
                  </SelectContent>
                </RadixSelect>
              </div>
              <div className="space-y-2">
                <label className="block font-medium text-foreground mb-1">Event Location</label>
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
              <input type="hidden" name="startAddress" value={startAddress} />
              <input type="hidden" name="startLat" value={startLat ?? ''} />
              <input type="hidden" name="startLng" value={startLng ?? ''} />
              <input type="hidden" name="clientName" value={eventName} />
              <input type="hidden" name="siteId" value={selectedSiteId || shift?.siteId || ''} />
            </div>
          ) : hideEscortSites && selectedKind === 'escort' && !shift ? (
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
                <input type="hidden" name="startAddress" value={startAddress} />
                <input type="hidden" name="startLat" value={startLat ?? ''} />
                <input type="hidden" name="startLng" value={startLng ?? ''} />
              </div>
            ) : (
            <>
              <Select
                id="site-select"
                instanceId="site-select"
                options={fixedSiteOptions}
                value={fixedSiteOptions.find(opt => opt.value === selectedSiteId) || null}
                onChange={option => setSelectedSiteId(option?.value || '')}
                placeholder="Select a site..."
                isClearable={!isReadOnly}
                isDisabled={isReadOnly}
              />
              <input type="hidden" name="siteId" value={selectedSiteId} />
            </>
          )}
          {state.errors?.siteId && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.siteId[0]}</p>
          )}
        </div>

        {/* Escort End Site Field */}
        {selectedKind === 'escort' && (
          <div>
            <label htmlFor="escortEndSiteId" className="block font-medium text-foreground mb-1">
              Escort End Site
            </label>
            {(isReadOnly || isGroupLocked) ? (
              <p className="text-sm text-foreground">{currentEscortEndSiteName}</p>
            ) : hideEscortSites && !shift ? (
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
                <input type="hidden" name="escortEndAddress" value={escortEndAddress} />
                <input type="hidden" name="escortEndLat" value={escortEndLat ?? ''} />
                <input type="hidden" name="escortEndLng" value={escortEndLng ?? ''} />
              </div>
            ) : (
              <>
                <Select
                  id="escort-end-site-select"
                  instanceId="escort-end-site-select"
                  options={escortEndSiteOptions}
                  value={escortEndSiteOptions.find(opt => opt.value === selectedEscortEndSiteId) || null}
                  onChange={option => setSelectedEscortEndSiteId(option?.value || '')}
                  placeholder="Select an escort end site..."
                  isClearable={false}
                />
                <input type="hidden" name="escortEndSiteId" value={selectedEscortEndSiteId} />
              </>
            )}
            {state.errors?.escortEndSiteId && (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.escortEndSiteId[0]}</p>
            )}
          </div>
        )}

        {/* Shift Type Field */}
        <div>
          <label htmlFor="shiftTypeId" className="block font-medium text-foreground mb-1">
            Guard Shift Type
          </label>
          {(isReadOnly || isGroupLocked) ? (
            <p className="text-sm text-foreground">{shiftTypes.find(st => st.id === (shift?.shiftTypeId || ''))?.name || shift?.shiftTypeId}</p>
          ) : (
          <Select
            id="shift-type-select"
            instanceId="shift-type-select"
            options={shiftTypeOptions}
            value={shiftTypeOptions.find(opt => opt.value === selectedShiftTypeId) || null}
            onChange={option => setSelectedShiftTypeId(option?.value || '')}
            placeholder="Select a guard shift type"
            isClearable={false}
            isSearchable={false}
            isDisabled={isReadOnly}
          />
          )}
          <input type="hidden" name="shiftTypeId" value={selectedShiftTypeId} />
          {state.errors?.shiftTypeId && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.shiftTypeId[0]}</p>
          )}
        </div>

        {/* Employee Field */}
        <div>
          <label htmlFor="employeeId" className="block font-medium text-foreground mb-1">
            Employee
          </label>
          <Select
            id="employee-select"
            instanceId="employee-select"
            options={employeeOptions}
            value={employeeOptions.find(opt => opt.value === selectedemployeeId) || null}
            onChange={option => setSelectedemployeeId(option?.value || '')}
            placeholder="Unassigned"
            isClearable={!isReadOnly}
            isDisabled={isReadOnly}
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
          <input type="hidden" name="employeeId" value={selectedemployeeId} />
        </div>

        {/* Date Field */}
        <div>
          <label htmlFor="date" className="block font-medium text-foreground mb-1">
            Date
          </label>
          {(isReadOnly || isGroupLocked) ? (
            <p className="text-sm text-foreground">{date ? format(date, 'yyyy-MM-dd') : '—'}</p>
          ) : (
          <>
          <input type="hidden" name="date" value={date ? format(date, 'yyyy-MM-dd') : ''} />
          <DatePicker
            selected={date}
            onChange={d => setDate(d)}
            dateFormat="yyyy-MM-dd"
            minDate={new Date()}
            disabled={isReadOnly}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
            wrapperClassName="w-full"
          />
          {state.errors?.date && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.date[0]}</p>}
          </>
          )}
        </div>

        {/* Config Fields */}
        <div className="grid grid-cols-2 gap-4">
          {selectedKind !== 'onsite' ? (
            <div>
              <label className="block font-medium text-foreground mb-1">
                Interval (min)
              </label>
              <input
                type="number"
                value={shiftTypeDurationMins}
                readOnly
                disabled
                className="w-full h-10 px-3 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed"
              />
              <input type="hidden" name="requiredCheckinIntervalMins" value={shiftTypeDurationMins} />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-set to shift duration — only one check-in required for escort shifts.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="requiredCheckinIntervalMins" className="block font-medium text-foreground mb-1">
                Interval (min)
              </label>
              <input
                type="number"
                name="requiredCheckinIntervalMins"
                id="requiredCheckinIntervalMins"
                defaultValue={shift?.requiredCheckinIntervalMins || 20}
                min={5}
                disabled={isReadOnly || isGroupLocked}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
              />
              {state.errors?.requiredCheckinIntervalMins && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                  {state.errors.requiredCheckinIntervalMins[0]}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="graceMinutes" className="block font-medium text-foreground mb-1">
              Grace Period (min)
            </label>
            <input
              type="number"
              name="graceMinutes"
              id="graceMinutes"
              defaultValue={shift?.graceMinutes || 2}
              min={1}
              disabled={isReadOnly || isGroupLocked}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
            {state.errors?.graceMinutes && (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.graceMinutes[0]}</p>
            )}
          </div>
        </div>

        {/* Note Field */}
        <div>
          <label htmlFor="note" className="block font-medium text-foreground mb-1">
            Note
          </label>
          {selectedKind === 'event_temporary' ? (
            <>
              <textarea
                value={clientNote}
                onChange={e => setClientNote(e.target.value)}
                rows={3}
                disabled={isReadOnly}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none disabled:bg-muted disabled:text-muted-foreground placeholder:text-muted-foreground/50"
                placeholder="Add any special instructions or notes for this guard shift..."
              />
              <input
                type="hidden"
                name="note"
                value={
                  eventName && eventType
                    ? `[${eventType} Event] ${eventName}${clientNote ? '\n' + clientNote : ''}`
                    : clientNote || ''
                }
              />
            </>
          ) : (
            <textarea
              name="note"
              id="note"
              defaultValue={shift?.note || ''}
              rows={3}
              disabled={isReadOnly}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none disabled:bg-muted disabled:text-muted-foreground placeholder:text-muted-foreground/50"
              placeholder="Add any special instructions or notes for this guard shift..."
            />
          )}
          {state.errors?.note && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.note[0]}</p>}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/50">
            {state.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/guard-shifts')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
            >
              {isPending ? 'Saving...' : shift ? 'Save Changes' : 'Schedule Guard Shift'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
