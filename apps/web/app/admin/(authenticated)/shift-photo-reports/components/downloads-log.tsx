'use client';

import { useState } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { useSearchParams } from 'next/navigation';
import { useAdminRouter } from '../../context/admin-router';
import PaginationNav from '../../components/pagination-nav';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parseISO } from 'date-fns';
import { Download } from 'lucide-react';
import SortableHeader from '@/components/sortable-header';
import toast from 'react-hot-toast';

type DownloadRecord = {
  id: string;
  reportId: string;
  reportNumber: string | null;
  shiftId: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  mode: string;
  userAgent: string | null;
  ipAddress: string | null;
  downloadedAt: string;
  createdAt: string;
  guardName: string | null;
  guardNumber: string | null;
  siteName: string | null;
  reportNumberDisplay: string | null;
};

type DownloadsLogProps = {
  downloads: Serialized<DownloadRecord>[];
  totalCount: number;
  dateFrom?: string;
  dateTo?: string;
  mode?: string;
  page: number;
  perPage: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const modeOptions = [
  { value: '', label: 'All Modes' },
  { value: 'single', label: 'Single' },
  { value: 'bulk', label: 'Bulk' },
];

export default function DownloadsLog({
  downloads,
  totalCount,
  dateFrom,
  dateTo,
  mode,
  page,
  perPage,
  sortBy = 'downloadedAt',
  sortOrder = 'desc',
}: DownloadsLogProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(dateFrom ? parseISO(dateFrom) : undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(dateTo ? parseISO(dateTo) : undefined);
  const [filterMode, setFilterMode] = useState(mode ?? '');

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }
    params.set('page', '1');
    router.push(`/admin/shift-photo-reports/downloads?${params.toString()}`);
  };

  const handleApplyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (filterDateFrom) {
      params.set('dateFrom', format(filterDateFrom, 'yyyy-MM-dd'));
    } else {
      params.delete('dateFrom');
    }
    if (filterDateTo) {
      params.set('dateTo', format(filterDateTo, 'yyyy-MM-dd'));
    } else {
      params.delete('dateTo');
    }
    if (filterMode) {
      params.set('mode', filterMode);
    } else {
      params.delete('mode');
    }
    params.set('page', '1');
    router.push(`/admin/shift-photo-reports?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterMode('');
    const params = new URLSearchParams();
    params.set('page', '1');
    router.push(`/admin/shift-photo-reports?${params.toString()}`);
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (mode) params.set('mode', mode);
    const url = `/api/admin/shift-photo-reports/downloads/export?${params.toString()}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `download_log_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success('Download log exported');
    } catch {
      toast.error('Failed to export download log');
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Download Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} total download{totalCount !== 1 ? 's' : ''} recorded.
          </p>
        </div>
        {downloads.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-foreground text-background text-sm font-bold rounded-lg hover:opacity-90 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date From</label>
            <DatePicker
              selected={filterDateFrom}
              onChange={date => setFilterDateFrom(date as Date)}
              selectsStart
              startDate={filterDateFrom}
              endDate={filterDateTo}
              maxDate={filterDateTo}
              dateFormat="yyyy-MM-dd"
              className="h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
              placeholderText="Start Date"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date To</label>
            <DatePicker
              selected={filterDateTo}
              onChange={date => setFilterDateTo(date as Date)}
              selectsEnd
              startDate={filterDateFrom}
              endDate={filterDateTo}
              minDate={filterDateFrom}
              dateFormat="yyyy-MM-dd"
              className="h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
              placeholderText="End Date"
            />
          </div>
          <div>
            <label htmlFor="filter-mode" className="block text-sm font-medium text-foreground mb-1">
              Mode
            </label>
            <select
              id="filter-mode"
              value={filterMode}
              onChange={e => setFilterMode(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
            >
              {modeOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleApplyFilters}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-foreground text-background text-sm font-bold rounded-lg hover:opacity-90 transition-colors shadow-sm"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearFilters}
            className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader label="Date/Time" field="downloadedAt" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Mode</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Admin</th>
                <SortableHeader label="Report #" field="reportNumber" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Guard" field="guardName" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Site" field="siteName" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {downloads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No downloads recorded.
                  </td>
                </tr>
              ) : (
                downloads.map((d, index) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      {(page - 1) * perPage + index + 1}
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-mono whitespace-nowrap">
                      {format(new Date(d.downloadedAt), 'yyyy/MM/dd HH:mm')}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          d.mode === 'bulk'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {d.mode.charAt(0).toUpperCase() + d.mode.slice(1)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <div className="font-medium text-foreground">{d.adminName}</div>
                      <div className="text-xs text-muted-foreground">{d.adminEmail}</div>
                    </td>
                    <td className="py-4 px-6 text-sm font-mono text-foreground">{d.reportNumberDisplay ?? '—'}</td>
                    <td className="py-4 px-6 text-sm text-foreground">{d.guardName ?? '—'}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{d.siteName ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />
    </div>
  );
}
