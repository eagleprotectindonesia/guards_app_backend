'use client';

import { useState, useEffect } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { useSearchParams } from 'next/navigation';
import { useAdminRouter } from '../../context/admin-router';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PaginationNav from '../../components/pagination-nav';
import Select from '../../components/select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parseISO } from 'date-fns';
import { Download, History, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import SortableHeader from '@/components/sortable-header';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { buildShiftReportsZip } from '@/lib/shift-photo-reports/bulk-zip';

type ReportWithDownload = {
  id: string;
  reportNumber: string | null;
  shiftId: string;
  employeeId: string;
  clientId: string | null;
  shiftStartsAt: string;
  shiftEndsAt: string;
  status: string;
  pdfS3Key: string | null;
  photoCount: number;
  generatedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  employee: { fullName: string; employeeNumber: string | null } | null;
  shift: {
    siteId: string | null;
    site: { id: string; name: string; clientName: string | null } | null;
  } | null;
  downloadUrl: string | null;
  downloadCount: number;
};

type ShiftPhotoReportsListProps = {
  reports: Serialized<ReportWithDownload>[];
  employees: { id: string; fullName: string }[];
  sites: { id: string; name: string }[];
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  siteId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  perPage: number;
  totalCount: number;
};

export default function ShiftPhotoReportsList({
  reports,
  employees,
  sites,
  dateFrom,
  dateTo,
  employeeId,
  siteId,
  status,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  page,
  perPage,
  totalCount,
}: ShiftPhotoReportsListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(
    dateFrom ? parseISO(dateFrom) : undefined
  );
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(
    dateTo ? parseISO(dateTo) : undefined
  );
  const [filterEmployeeId, setFilterEmployeeId] = useState(employeeId || '');
  const [filterSiteId, setFilterSiteId] = useState(siteId || '');
  const [filterStatus, setFilterStatus] = useState(status || '');

  const { hasPermission } = useSession();
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  const downloadableReports = reports.filter(r => r.downloadUrl);
  const isAllSelected = downloadableReports.length > 0 && downloadableReports.every(r => selectedIds.has(r.id));
  const isSomeSelected = downloadableReports.some(r => selectedIds.has(r.id)) && !isAllSelected;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
  }, [page]);

  const employeeOptions = [
    { value: '', label: 'All Guards' },
    ...employees.map(emp => ({ value: emp.id, label: emp.fullName })),
  ];

  const siteOptions = [
    { value: '', label: 'All Sites' },
    ...sites.map(s => ({ value: s.id, label: s.name })),
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'generated', label: 'Generated' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'regenerated', label: 'Regenerated' },
  ];

  const statusBadge = (s: string) => {
    const classes: Record<string, string> = {
      generated: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      regenerated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };
    return classes[s] || 'bg-gray-100 text-gray-700';
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

    if (filterEmployeeId) {
      params.set('employeeId', filterEmployeeId);
    } else {
      params.delete('employeeId');
    }

    if (filterSiteId) {
      params.set('siteId', filterSiteId);
    } else {
      params.delete('siteId');
    }

    if (filterStatus) {
      params.set('status', filterStatus);
    } else {
      params.delete('status');
    }

    params.set('page', '1');
    setSelectedIds(new Set());
    router.push(`/admin/shift-photo-reports?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterEmployeeId('');
    setFilterSiteId('');
    setFilterStatus('');
    setSelectedIds(new Set());

    const params = new URLSearchParams();
    params.set('page', '1');
    router.push(`/admin/shift-photo-reports?${params.toString()}`);
  };

  const handleSort = (field: string) => {
    setSelectedIds(new Set());
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
    }
    params.set('page', '1');
    router.push(`/admin/shift-photo-reports?${params.toString()}`);
  };

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(downloadableReports.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const buildFilename = (report: ReportWithDownload): string => {
    const parts: string[] = [];
    const safe = (s: string) =>
      s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unnamed';

    if (report.employee?.fullName) {
      parts.push(safe(report.employee.fullName));
      if (report.employee.employeeNumber) parts.push(safe(report.employee.employeeNumber));
    }
    if (report.shift?.site?.name) parts.push(safe(report.shift.site.name));
    if (report.shiftStartsAt) parts.push(report.shiftStartsAt.slice(0, 10));

    if (parts.length > 0) return `shift_report_${parts.join('_')}.pdf`;
    return `shift_report_${report.reportNumber ?? report.id}.pdf`;
  };

  const logDownload = (reportId: string, mode: 'single' | 'bulk') => {
    fetch(`/api/admin/shift-photo-reports/${reportId}/download-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => {});
  };

  const handleSingleDownload = async (report: ReportWithDownload) => {
    if (!report.downloadUrl) return;
    logDownload(report.id, 'single');
    try {
      const response = await fetch(report.downloadUrl);
      if (!response.ok) throw new Error(`Failed to fetch`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildFilename(report);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download report');
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0 || isBulkDownloading) return;
    setIsBulkDownloading(true);
    try {
      const selected = reports.filter(r => selectedIds.has(r.id) && r.downloadUrl);
      selected.forEach(r => logDownload(r.id, 'bulk'));
      const blob = await buildShiftReportsZip(selected);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shift-photo-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selected.length} report(s)`);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk download failed');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Shift Photo Reports'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedIds.size > 0
              ? 'Select reports to download as a single ZIP file.'
              : 'Review and manage shift photo report generation.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size === 0 && canViewAudit && (
            <Link
              href="/admin/shift-photo-reports/downloads"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted transition-colors shadow-sm"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDownload}
                disabled={isBulkDownloading}
                className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-2" />
                {isBulkDownloading ? 'Zipping\u2026' : `Download Selected (${selectedIds.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Card */}
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
            <label htmlFor="filter-guard" className="block text-sm font-medium text-foreground mb-1">
              Guard
            </label>
            <Select
              id="filter-guard"
              instanceId="filter-guard"
              options={employeeOptions}
              value={employeeOptions.find(option => option.value === filterEmployeeId)}
              onChange={selectedOption => setFilterEmployeeId(selectedOption ? selectedOption.value : '')}
              placeholder="All Guards"
              isClearable={false}
            />
          </div>
          <div>
            <label htmlFor="filter-site" className="block text-sm font-medium text-foreground mb-1">
              Site
            </label>
            <Select
              id="filter-site"
              instanceId="filter-site"
              options={siteOptions}
              value={siteOptions.find(option => option.value === filterSiteId)}
              onChange={selectedOption => setFilterSiteId(selectedOption ? selectedOption.value : '')}
              placeholder="All Sites"
              isClearable={false}
            />
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-foreground mb-1">
              Status
            </label>
            <Select
              id="filter-status"
              instanceId="filter-status"
              options={statusOptions}
              value={statusOptions.find(option => option.value === filterStatus)}
              onChange={selectedOption => setFilterStatus(selectedOption ? selectedOption.value : '')}
              placeholder="All Statuses"
              isClearable={false}
            />
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

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader
                  label="Report ID"
                  field="reportNumber"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Status"
                  field="status"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Guard"
                  field="employee"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Site"
                  field="site"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Shift</th>
                <SortableHeader
                  label="Photos"
                  field="photoCount"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Created"
                  field="generatedAt"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Downloads
                </th>
                <th
                  className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-end gap-3">
                    <span className="uppercase">Actions</span>
                    {sortBy === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                    ) : (
                      <ArrowUpDown className="w-4 h-4" />
                    )}
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={input => {
                        if (input) input.indeterminate = isSomeSelected;
                      }}
                      onChange={e => {
                        e.stopPropagation();
                        handleSelectAllChange(e.target.checked);
                      }}
                      disabled={downloadableReports.length === 0}
                      className="h-4 w-4 rounded border-border text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-30"
                      aria-label="Select all"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No shift photo reports found.
                  </td>
                </tr>
              ) : (
                reports.map((report, index) => (
                  <tr key={report.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      {(page - 1) * perPage + index + 1}
                    </td>
                    <td className="py-4 px-6 text-sm font-mono text-foreground">
                      {report.reportNumber ?? '—'}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(report.status)}`}>
                        {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      {report.employee?.fullName ?? '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">
                        {report.shift?.site?.name ?? '—'}
                      </div>
                      {report.shift?.site?.clientName && (
                        <div className="text-xs text-muted-foreground/80">
                          {report.shift.site.clientName}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">
                        {format(new Date(report.shiftStartsAt), 'yyyy/MM/dd')}
                      </div>
                      <div className="text-xs text-muted-foreground/80">
                        {format(new Date(report.shiftStartsAt), 'HH:mm')} - {format(new Date(report.shiftEndsAt), 'HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-center text-muted-foreground">
                      {report.photoCount}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {report.generatedAt
                        ? format(new Date(report.generatedAt), 'yyyy/MM/dd HH:mm')
                        : '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-center text-muted-foreground">
                      {report.downloadCount > 0 ? (
                        <span className="font-semibold text-foreground">{report.downloadCount}</span>
                      ) : (
                        <span className="text-muted-foreground/50">0</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {selectedIds.size === 0 && (
                          report.downloadUrl ? (
                            <button
                              onClick={() => handleSingleDownload(report)}
                              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="p-2 text-muted-foreground/40" title="No PDF available">
                              <Download className="w-4 h-4" />
                            </span>
                          )
                        )}
                        {report.downloadUrl ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(report.id)}
                            onChange={e => handleCheckboxChange(report.id, e.target.checked)}
                            aria-label={`Select report ${report.reportNumber ?? report.id}`}
                            className="h-4 w-4 rounded border-border text-red-600 focus:ring-red-500 cursor-pointer"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            disabled
                            title="No PDF available"
                            className="h-4 w-4 rounded border-border cursor-not-allowed opacity-30"
                          />
                        )}
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
    </div>
  );
}
