'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { MessageSquare, Plus, Trash2, ExternalLink, ArrowLeft } from 'lucide-react';
import { updateGroupShiftAction, addGuardToGroupAction, removeGuardFromGroupAction } from '../group-shifts/actions';
import AddressAutocompleteInput from '@/components/address-autocomplete-input';
import AddressMapPreview from '@/components/address-map-preview';

type GroupShiftDetailData = {
  id: string;
  siteId: string;
  endSiteId: string | null;
  shiftTypeId: string;
  date: Date;
  kind: string;
  clientName: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  site: { id: string; name: string; kind: string; address: string | null; latitude: number | null; longitude: number | null };
  endSite: { id: string; name: string; address: string | null; kind: string; latitude: number | null; longitude: number | null } | null;
  shiftType: { id: string; name: string; startTime: string; endTime: string };
  groupChat: { id: string; title: string } | null;
  shifts: {
    id: string;
    employeeId: string | null;
    startsAt: Date;
    endsAt: Date;
    status: string;
    employee: { id: string; fullName: string; employeeNumber: string | null } | null;
    attendance: { id: string; status: string; recordedAt: Date } | null;
  }[];
};

type Props = {
  groupShift: GroupShiftDetailData;
  admins: { id: string; name: string }[];
  availableEmployees: { id: string; fullName: string; employeeNumber: string | null }[];
  hideEscortSites?: boolean;
};

const statusBadge: Record<string, string> = {
  scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  missed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function GroupShiftDetail({ groupShift, availableEmployees, hideEscortSites = false }: Props) {
  const router = useRouter();
  const [clientName, setClientName] = useState(groupShift.clientName || '');
  const [note, setNote] = useState(groupShift.note || '');
  const [startAddress, setStartAddress] = useState(groupShift.site.address || '');
  const [startLat, setStartLat] = useState<number | null>(groupShift.site.latitude ?? null);
  const [startLng, setStartLng] = useState<number | null>(groupShift.site.longitude ?? null);
  const [endAddress, setEndAddress] = useState(groupShift.endSite?.address || '');
  const [endLat, setEndLat] = useState<number | null>(groupShift.endSite?.latitude ?? null);
  const [endLng, setEndLng] = useState<number | null>(groupShift.endSite?.longitude ?? null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isAddingGuard, setIsAddingGuard] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [removingShiftId, setRemovingShiftId] = useState<string | null>(null);
  const isOngoing = groupShift.shifts.some(s => s.status !== 'scheduled');

  const handleSaveMeta = async () => {
    setIsSavingMeta(true);
    try {
      await updateGroupShiftAction(groupShift.id, {
        clientName,
        note,
        ...(hideEscortSites ? {
          startAddress,
          startLat: startLat ?? undefined,
          startLng: startLng ?? undefined,
          endAddress,
          endLat: endLat ?? undefined,
          endLng: endLng ?? undefined,
        } : {}),
      });
      toast.success('Group shift updated');
    } catch {
      toast.error('Failed to update group shift');
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleAddGuard = async () => {
    if (!selectedEmployeeId) return;
    setIsAddingGuard(true);
    try {
      await addGuardToGroupAction(groupShift.id, selectedEmployeeId);
      toast.success('Guard added');
      setSelectedEmployeeId('');
      router.refresh();
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || 'Failed to add guard');
    } finally {
      setIsAddingGuard(false);
    }
  };

  const handleRemoveGuard = async (shiftId: string) => {
    setRemovingShiftId(shiftId);
    try {
      await removeGuardFromGroupAction(groupShift.id, shiftId);
      toast.success('Guard removed');
      router.refresh();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Failed to remove guard');
    } finally {
      setRemovingShiftId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-foreground/60">
        <Link href="/admin/guard-shifts/group-shifts" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft size={14} />
          Group Shifts
        </Link>
        <span>/</span>
        <span className="text-foreground">{groupShift.clientName || 'Detail'}</span>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">
          Escort: {groupShift.site.name} → {groupShift.endSite?.name || '—'}
        </h1>
        <p className="text-foreground/60 text-sm">
          {format(new Date(groupShift.date), 'dd MMM yyyy')} &middot; {groupShift.shiftType.name} (
          {groupShift.shiftType.startTime} - {groupShift.shiftType.endTime}) &middot; {groupShift.shifts.length}{' '}
          guard(s)
        </p>
      </div>

      {/* Editable Metadata */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground/80 mb-1">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
              placeholder="Client name"
            />
          </div>
          {hideEscortSites ? (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground/80 mb-1">Start Location</label>
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
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                  <input
                    type="number"
                    value={startLng ?? ''}
                    onChange={e => setStartLng(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="Longitude"
                    step="any"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                </div>
                <AddressMapPreview
                  latitude={startLat}
                  longitude={startLng}
                  onLocationChange={(lat, lng) => { setStartLat(lat); setStartLng(lng); }}
                  onAddressChange={setStartAddress}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground/80 mb-1">End Location</label>
                <AddressAutocompleteInput
                  value={endAddress}
                  onChange={setEndAddress}
                  onPlaceSelect={(address, lat, lng) => {
                    setEndAddress(address);
                    setEndLat(lat);
                    setEndLng(lng);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={endLat ?? ''}
                    onChange={e => setEndLat(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="Latitude"
                    step="any"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                  <input
                    type="number"
                    value={endLng ?? ''}
                    onChange={e => setEndLng(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="Longitude"
                    step="any"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                </div>
                <AddressMapPreview
                  latitude={endLat}
                  longitude={endLng}
                  onLocationChange={(lat, lng) => { setEndLat(lat); setEndLng(lng); }}
                  onAddressChange={setEndAddress}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Start Site</label>
                <p className="px-3 py-2 text-sm text-foreground bg-background/50 rounded-lg border border-border">
                  {groupShift.site.name}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">End Site</label>
                <p className="px-3 py-2 text-sm text-foreground bg-background/50 rounded-lg border border-border">
                  {groupShift.endSite?.name || '—'}
                  {groupShift.endSite?.address && (
                    <span className="text-foreground/60 ml-1">({groupShift.endSite.address})</span>
                  )}
                </p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Shift Type</label>
            <p className="px-3 py-2 text-sm text-foreground bg-background/50 rounded-lg border border-border">
              {groupShift.shiftType.name} ({groupShift.shiftType.startTime} - {groupShift.shiftType.endTime})
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Note</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none"
            placeholder="Optional note"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveMeta}
            disabled={isSavingMeta}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isSavingMeta ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Group Chat */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Group Chat</h2>
        {groupShift.groupChat ? (
          <Link
            href={`/admin/chat?group=${groupShift.groupChat.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <MessageSquare size={16} />
            Open Group Chat
          </Link>
        ) : (
          <p className="text-foreground/40 text-sm">No group chat created for this shift.</p>
        )}
      </div>

      {/* Child Shifts */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Guards ({groupShift.shifts.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 font-medium text-foreground/60">#</th>
                <th className="text-left py-3 px-2 font-medium text-foreground/60">Guard</th>
                <th className="text-left py-3 px-2 font-medium text-foreground/60">Status</th>
                <th className="text-left py-3 px-2 font-medium text-foreground/60">Time</th>
                <th className="text-left py-3 px-2 font-medium text-foreground/60">Attendance</th>
                <th className="text-left py-3 px-2 font-medium text-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupShift.shifts.map((shift, i) => (
                <tr key={shift.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                  <td className="py-3 px-2 text-foreground/60">{i + 1}</td>
                  <td className="py-3 px-2 font-medium text-foreground">
                    {shift.employee?.fullName || 'Unassigned'}
                    {shift.employee?.employeeNumber && (
                      <span className="text-foreground/40 ml-1">({shift.employee.employeeNumber})</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge[shift.status] || ''}`}
                    >
                      {shift.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-foreground">
                    {format(new Date(shift.startsAt), 'HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
                  </td>
                  <td className="py-3 px-2 text-foreground">
                    {shift.attendance ? (
                      <span className="text-green-400">{shift.attendance.status}</span>
                    ) : (
                      <span className="text-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/guard-shifts/${shift.id}/edit`}
                        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400 text-xs"
                      >
                        <ExternalLink size={12} />
                        Edit
                      </Link>
                      {shift.status === 'scheduled' && (
                        <button
                          onClick={() => handleRemoveGuard(shift.id)}
                          disabled={removingShiftId === shift.id}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-400 text-xs disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                          {removingShiftId === shift.id ? '...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Guard */}
        <div className="mt-6 p-4 border border-dashed border-border rounded-lg">
          <h3 className="text-sm font-medium text-foreground mb-3">Add Guard</h3>
          {isOngoing ? (
            <p className="text-sm text-foreground/40">Cannot add guards to an ongoing group shift.</p>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <select
                  value={selectedEmployeeId}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                >
                  <option value="">Select guard...</option>
                  {availableEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                      {emp.employeeNumber ? ` (${emp.employeeNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddGuard}
                disabled={!selectedEmployeeId || isAddingGuard}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1"
              >
                <Plus size={14} />
                {isAddingGuard ? 'Adding...' : 'Add Guard'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
