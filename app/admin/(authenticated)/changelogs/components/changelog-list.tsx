'use client';

import { useState } from 'react';
import { Changelog, Prisma } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import PaginationNav from '../../components/pagination-nav';
import Search from '../../components/search';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { Eye } from 'lucide-react';
import ChangelogDetailsModal from './changelog-details-modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parseISO } from 'date-fns';

type ChangelogWithAdmin = Changelog & {
  admin?: { name: string } | null;
};

type ChangelogListProps = {
  changelogs: Serialized<ChangelogWithAdmin>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hideEntityType?: boolean;
  fixedEntityType?: string;
  entityIdLabel?: string;
  showEntityName?: boolean;
};

export default function ChangelogList({
  changelogs,
  page,
  perPage,
  totalCount,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  hideEntityType = false,
  fixedEntityType,
  entityIdLabel = 'Entity ID',
  showEntityName = false,
}: ChangelogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedDetails, setSelectedDetails] = useState<Prisma.JsonValue | null>(null);

  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  const [startDate, setStartDate] = useState<Date | undefined>(
    startDateParam ? parseISO(startDateParam) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    endDateParam ? parseISO(endDateParam) : undefined
  );

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start || undefined);
    setEndDate(end || undefined);

    const params = new URLSearchParams(searchParams.toString());
    if (start) {
      params.set('startDate', format(start, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
    }

    if (end) {
      params.set('endDate', format(end, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    if (start || !start) { // Always update if changed
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    }
  };

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
             {fixedEntityType ? `${fixedEntityType} Audit Log` : 'Audit Log'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
             {fixedEntityType 
                ? `Track changes for ${fixedEntityType}s.` 
                : 'Track system changes and administrative actions.'}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto flex-wrap">
           {/* Filters */}
           <div className="w-full md:w-auto min-w-[200px]">
             <DatePicker
               selectsRange={true}
               startDate={startDate}
               endDate={endDate}
               onChange={handleDateChange}
               isClearable={true}
               placeholderText="Filter by Date Range"
               className="h-10 px-3 w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
             />
           </div>

           <select 
             className="h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
             value={searchParams.get('action') || ''}
             onChange={(e) => handleFilterChange('action', e.target.value)}
           >
             <option value="">All Actions</option>
             <option value="CREATE">Create</option>
             <option value="UPDATE">Update</option>
             <option value="DELETE">Delete</option>
             <option value="BULK_CREATE">Bulk Create</option>
           </select>

           {!fixedEntityType && (
             <select
               className="h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
               value={searchParams.get('entityType') || ''}
               onChange={(e) => handleFilterChange('entityType', e.target.value)}
             >
               <option value="">All Entities</option>
               <option value="Guard">Guard</option>
               <option value="Site">Site</option>
               <option value="Shift">Shift</option>
               <option value="Alert">Alert</option>
             </select>
           )}

          <div className="w-full md:w-64">
            <Search placeholder={`Search ${entityIdLabel}...`} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <SortableHeader
                  label="Date"
                  field="createdAt"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="pl-6"
                />
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin</th>
                <SortableHeader
                  label="Action"
                  field="action"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                 {!hideEntityType && (
                    <SortableHeader
                      label="Entity Type"
                      field="entityType"
                      currentSortBy={sortBy}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                    />
                 )}
                <SortableHeader
                  label={entityIdLabel}
                  field="entityId"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                {showEntityName && (
                  <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                )}
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {changelogs.length === 0 ? (
                <tr>
                  <td colSpan={hideEntityType ? (showEntityName ? 6 : 5) : (showEntityName ? 7 : 6)} className="py-8 text-center text-gray-500">
                    No logs found.
                  </td>
                </tr>
              ) : (
                changelogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      {log.admin?.name || <span className="text-gray-400 italic">System</span>}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${log.action === 'CREATE' || log.action === 'BULK_CREATE' ? 'bg-green-100 text-green-800' : 
                          log.action === 'DELETE' ? 'bg-red-100 text-red-800' : 
                          'bg-blue-100 text-blue-800'}`}>
                        {log.action}
                      </span>
                    </td>
                    {!hideEntityType && (
                        <td className="py-4 px-6 text-sm text-gray-700">{log.entityType}</td>
                    )}
                    <td className="py-4 px-6 text-sm text-gray-500 font-mono text-xs">{log.entityId}</td>
                    {showEntityName && (
                      <td className="py-4 px-6 text-sm text-gray-700">
                         {/* Safe access to details.name if it exists */}
                         {(log.details && typeof log.details === 'object' && 'name' in log.details) 
                           ? String((log.details as Record<string, unknown>).name) 
                           : '-'}
                      </td>
                    )}
                    <td className="py-4 px-6 text-right">
                       <button
                          onClick={() => setSelectedDetails(log.details)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ChangelogDetailsModal 
        isOpen={!!selectedDetails} 
        onClose={() => setSelectedDetails(null)} 
        details={selectedDetails} 
      />
    </div>
  );
}
