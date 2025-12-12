'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Checkin, Guard, Shift, Site } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import PaginationNav from '../../components/pagination-nav';
import { MapPin, Clock, Filter, Globe } from 'lucide-react'; // Added Globe icon
import CheckinFilterModal from './checkin-filter-modal';
import { format } from 'date-fns';

// Define the type for a Checkin with its relations
// Define a type for the checkin metadata that includes location information
type CheckinMetadata = {
  lat: number;
  lng: number;
} & Record<string, any>; // Allow additional properties

// Type guard to check if an object has valid location data
function hasValidLocation(metadata: any): metadata is CheckinMetadata {
  return (
    metadata &&
    typeof metadata === 'object' &&
    'lat' in metadata &&
    'lng' in metadata &&
    typeof metadata.lat === 'number' &&
    typeof metadata.lng === 'number'
  );
}

type CheckinWithRelations = Checkin & {
  guard: Guard;
  shift: Shift & {
    site: Site;
  };
};

type CheckinListProps = {
  checkins: Serialized<CheckinWithRelations>[];
  page: number;
  perPage: number;
  totalCount: number;
  guards: Serialized<Guard>[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    guardId?: string;
  };
};

export default function CheckinList({ checkins, page, perPage, totalCount, guards, initialFilters }: CheckinListProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApplyFilters = (filters: { startDate?: Date; endDate?: Date; guardId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination when filtering
    params.set('page', '1');

    if (filters.startDate) {
      params.set('from', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('from');
    }

    if (filters.endDate) {
      params.set('to', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('to');
    }

    if (filters.guardId) {
      params.set('guardId', filters.guardId);
    } else {
      params.delete('guardId');
    }

    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Check-ins</h1>
          <p className="text-sm text-gray-500 mt-1">View guard check-in history and status.</p>
        </div>
        <button
          onClick={() => setIsFilterOpen(true)}
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Guard</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Shift Date</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>{' '}
                {/* New Column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checkins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    {' '}
                    {/* Updated colspan */}
                    No check-ins found.
                  </td>
                </tr>
              ) : (
                checkins.map(checkin => (
                  <tr key={checkin.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                          {checkin.guard.name.substring(0, 2).toUpperCase()}
                        </div>
                        {checkin.guard.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {checkin.shift.site.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-900 font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {new Date(checkin.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{new Date(checkin.at).toLocaleDateString()}</div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {checkin.status === 'on_time' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          On Time
                        </span>
                      )}
                      {checkin.status === 'late' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Late
                        </span>
                      )}
                      {checkin.status === 'invalid' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Invalid
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(checkin.shift.date).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {hasValidLocation(checkin.metadata) ? (
                        <div className="flex flex-col">
                          <div>Lat: {checkin.metadata.lat.toFixed(3)}</div>
                          <div>Lng: {checkin.metadata.lng.toFixed(3)}</div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <CheckinFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilters}
        initialFilters={initialFilters}
        guards={guards}
      />
    </div>
  );
}
