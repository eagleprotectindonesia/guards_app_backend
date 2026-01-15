'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Checkin, Shift, Site } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';
import { Serialized } from '@/lib/utils';
import PaginationNav from '../../components/pagination-nav';
import { MapPin, Clock, Filter } from 'lucide-react'; // Added Globe icon
import CheckinFilterModal from './checkin-filter-modal';
import CheckinExport from './checkin-export';
import { format } from 'date-fns';
import { JsonValue } from '@prisma/client/runtime/client';

// Define the type for a Checkin with its relations
// Define a type for the checkin metadata that includes location information
type CheckinMetadata = {
  lat: number;
  lng: number;
};

// Type employee to check if an object has valid location data
function hasValidLocation(metadata: JsonValue): metadata is CheckinMetadata {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    'lat' in metadata &&
    'lng' in metadata &&
    typeof metadata.lat === 'number' &&
    typeof metadata.lng === 'number'
  );
}

type CheckinWithRelations = Checkin & {
  employee: ExtendedEmployee;
  shift: Shift & {
    site: Site;
  };
};

type CheckinListProps = {
  checkins: Serialized<CheckinWithRelations>[];
  page: number;
  perPage: number;
  totalCount: number;
  employees: Serialized<ExtendedEmployee>[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
  };
};

export default function CheckinList({ checkins, page, perPage, totalCount, employees, initialFilters }: CheckinListProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApplyFilters = (filters: { startDate?: Date; endDate?: Date; employeeId: string }) => {
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

    if (filters.employeeId) {
      params.set('employeeId', filters.employeeId);
    } else {
      params.delete('employeeId');
    }

    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Check-ins</h1>
          <p className="text-sm text-muted-foreground mt-1">View employee check-in history and status.</p>
        </div>
        <div className="flex items-center gap-2">
          <CheckinExport initialFilters={initialFilters} employees={employees} />
          <button
            onClick={() => setIsFilterOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Shift Date</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
                {/* New Column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checkins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    {' '}
                    {/* Updated colspan */}
                    No check-ins found.
                  </td>
                </tr>
              ) : (
                checkins.map(checkin => (
                  <tr key={checkin.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                          {checkin.employee.fullName.substring(0, 2).toUpperCase()}
                        </div>
                        {checkin.employee.fullName}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-muted-foreground/60" />
                        {checkin.shift.site.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/60" />
                        {new Date(checkin.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(checkin.at), 'yyyy/MM/dd')}</div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {checkin.status === 'on_time' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          On Time
                        </span>
                      )}
                      {checkin.status === 'late' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Late
                        </span>
                      )}
                      {checkin.status === 'invalid' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Invalid
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(checkin.shift.date), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
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
        employees={employees}
      />
    </div>
  );
}

