'use client';

import { useState, useTransition } from 'react';
import { Shift, Site, ShiftType, Guard, Attendance } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteShift, cancelShift } from '../actions';
import ShiftFilterModal from './shift-filter-modal';
import BulkCreateModal from './bulk-create-modal';
import ShiftExport from './shift-export';
import ShiftActionModal from './shift-action-modal';
import { DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Upload, ArrowUpDown, ArrowUp, ArrowDown, History } from 'lucide-react';

export type ShiftWithRelations = Shift & {
  site: Site;
  shiftType: ShiftType;
  guard: Guard | null;
  attendance: Attendance | null;
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
};

type ShiftListProps = {
  shifts: Serialized<ShiftWithRelations>[];
  sites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  guards: Serialized<Guard>[];
  startDate?: string;
  endDate?: string;
  guardId?: string;
  siteId?: string;
  sort?: string;
  page: number;
  perPage: number;
  totalCount: number;
  isSuperAdmin?: boolean;
};

export default function ShiftList({
  shifts,
  sites,
  guards,
  startDate,
  endDate,
  guardId,
  siteId,
  sort = 'desc',
  page,
  perPage,
  totalCount,
  isSuperAdmin = false,
}: ShiftListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setSelectedShiftId(id);
  };

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    const newSort = sort === 'desc' ? 'asc' : 'desc';
    params.set('sort', newSort);
    params.set('page', '1');
    router.push(`/admin/shifts?${params.toString()}`);
  };

  const handleConfirmDelete = () => {
    if (!selectedShiftId) return;

    startTransition(async () => {
      const result = await deleteShift(selectedShiftId);
      if (result.success) {
        toast.success('Shift deleted successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to delete shift.');
      }
    });
  };

  const handleCancelShift = (note?: string) => {
    if (!selectedShiftId) return;

    startTransition(async () => {
      const result = await cancelShift(selectedShiftId, note);
      if (result.success) {
        toast.success('Shift cancelled successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to cancel shift.');
      }
    });
  };

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date; siteId: string; guardId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
    }

    if (filters.endDate) {
      params.set('endDate', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    if (filters.siteId) {
      params.set('siteId', filters.siteId);
    } else {
      params.delete('siteId');
    }

    if (filters.guardId) {
      params.set('guardId', filters.guardId);
    } else {
      params.delete('guardId');
    }

    if (sort) {
      params.set('sort', sort);
    }

    params.set('page', '1'); // Reset to page 1 when filtering
    router.push(`/admin/shifts?${params.toString()}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'missed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const activeFiltersCount = [startDate, endDate, guardId, siteId].filter(Boolean).length;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage guard schedules and assignments.</p>
        </div>
        <div className="flex gap-2">
          <ShiftExport
            initialFilters={{
              startDate,
              endDate,
              guardId,
              siteId,
            }}
          />
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm ${
              activeFiltersCount > 0 ? 'text-red-600 border-red-200 bg-red-50' : ''
            }`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsBulkCreateOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload CSV
          </button>
          {isSuperAdmin && (
            <Link
              href="/admin/shifts/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          <Link
            href="/admin/shifts/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Schedule Shift
          </Link>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Shift Type</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Guard</th>
                <th
                  className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={handleSort}
                >
                  <div className="flex items-center gap-1">
                    Date / Time
                    {sort === 'asc' ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : sort === 'desc' ? (
                      <ArrowDown className="w-4 h-4" />
                    ) : (
                      <ArrowUpDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">
                  <div className="flex flex-col">
                    <span>Created By</span>
                    <span className="text-gray-400">Updated By</span>
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No shifts found. Schedule one to get started.
                  </td>
                </tr>
              ) : (
                shifts.map(shift => (
                  <tr key={shift.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{shift.site.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{shift.shiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {shift.guard ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold">
                            {shift.guard.name.substring(0, 2).toUpperCase()}
                          </div>
                          {shift.guard.name}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      <div className="font-medium">{new Date(shift.startsAt).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(shift.startsAt), 'HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          shift.status
                        )}`}
                      >
                        {shift.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{shift.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500 text-center">
                      <div className="flex flex-col items-center">
                        <div className="font-medium text-gray-900" title="Created By">
                          {shift.createdBy?.name || '-'}
                        </div>
                        <div className="text-xs text-gray-400" title="Last Updated By">
                          {shift.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <Link
                          href={`/admin/shifts/${shift.id}/edit`}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                        <DeleteButton
                          onClick={() => handleDeleteClick(shift.id)}
                          disabled={isPending || (!isSuperAdmin && shift.status !== 'in_progress' && shift.status !== 'scheduled')}
                          title={
                            !isSuperAdmin && shift.status !== 'in_progress' && shift.status !== 'scheduled'
                              ? 'Only in-progress or scheduled shifts can be cancelled'
                              : 'Actions'
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      {/* Dialogs */}
      {isFilterOpen && (
        <ShiftFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApply={handleApplyFilter}
          initialFilters={{
            startDate,
            endDate,
            siteId,
            guardId,
          }}
          sites={sites}
          guards={guards}
        />
      )}

      <BulkCreateModal isOpen={isBulkCreateOpen} onClose={() => setIsBulkCreateOpen(false)} />

      <ShiftActionModal
        isOpen={!!selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
        onDelete={handleConfirmDelete}
        onCancelShift={handleCancelShift}
        isPending={isPending}
        isSuperAdmin={isSuperAdmin}
        status={shifts.find(s => s.id === selectedShiftId)?.status}
      />
    </div>
  );
}
