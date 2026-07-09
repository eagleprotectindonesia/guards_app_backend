'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { useSearchParams } from 'next/navigation';
import { useAdminRouter } from '../../context/admin-router';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PaginationNav from '../../components/pagination-nav';
import { format, parseISO } from 'date-fns';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';
import { Download, History, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import SortableHeader from '@/components/sortable-header';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { buildShiftReportDownloadFilename } from '@repo/shared';
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
  employees: { id: string; fullName: string; employeeNumber: string | null }[];
  sites: { id: string; name: string }[];
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  employeeNumber?: string;
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
  employeeNumber,
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
  const employeeById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const employeeByNumber = useMemo(
    () => new Map(employees.filter(e => e.employeeNumber).map(e => [e.employeeNumber!, e])),
    [employees]
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => {
    if (employeeId) return employeeId;
    if (employeeNumber) return employeeByNumber.get(employeeNumber)?.id || '';
    return '';
  });
  const filterEmployeeNumber = (selectedEmployeeId && employeeById.get(selectedEmployeeId)?.employeeNumber) || '';
  const [filterSiteId, setFilterSiteId] = useState(siteId || '');
  const [filterStatus, setFilterStatus] = useState(status || '');

  const { hasPermission } = useSession();
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);
  const { apply } = useFilterUrlSync('/admin/shift-photo-reports');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  const downloadableReports = reports.filter(r => r.downloadUrl);
  const isAllSelected = downloadableReports.length > 0 && downloadableReports.every(r => selectedIds.has(r.id));
  const isSomeSelected = downloadableReports.some(r => selectedIds.has(r.id)) && !isAllSelected;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
  }, [page]);

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
    setSelectedIds(new Set());
    apply({
      dateFrom: filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : null,
      dateTo: filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : null,
      employeeId: selectedEmployeeId || null,
      employeeNumber: filterEmployeeNumber || null,
      siteId: filterSiteId || null,
      status: filterStatus || null,
    });
  };

  const handleClearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSelectedEmployeeId('');
    setFilterSiteId('');
    setFilterStatus('');
    setSelectedIds(new Set());
    apply({
      dateFrom: null,
      dateTo: null,
      employeeId: null,
      employeeNumber: null,
      siteId: null,
      status: null,
    });
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
    return buildShiftReportDownloadFilename({
      siteName: report.shift?.site?.name,
      shiftStartsAt: new Date(report.shiftStartsAt),
      shiftEndsAt: new Date(report.shiftEndsAt),
      reportNumber: report.reportNumber,
      fallbackId: report.id,
    });
  };

  const logDownload = (reportId: string, mode: 'single' | 'bulk') => {
    fetch(`/api/admin/shift-photo-reports/${reportId}/download-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => {});
  };

  const handleSingleDownload = async (report: ReportWithDownload) => {
    if (!report.downloadUrl || downloadingIds.has(report.id)) return;
    setDownloadingIds(prev => new Set(prev).add(report.id));
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
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(report.id);
        return next;
      });
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

      {/* Filters */}
      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        <DateRangeFilter
          from={filterDateFrom}
          to={filterDateTo}
          onChange={(from, to) => {
            setFilterDateFrom(from);
            setFilterDateTo(to);
          }}
          fromLabel="Date From"
          toLabel="Date To"
        />
        <SelectFilter
          label="Guard"
          value={selectedEmployeeId}
          options={employees.map(emp => ({ value: emp.id, label: emp.fullName }))}
          onChange={setSelectedEmployeeId}
          id="filter-guard"
          instanceId="filter-guard"
          allLabel="All Guards"
        />
        <SelectFilter
          label="Guard ID"
          value={filterEmployeeNumber}
          options={employees.filter(emp => emp.employeeNumber).map(emp => ({ value: emp.employeeNumber!, label: `${emp.employeeNumber} — ${emp.fullName}` }))}
          onChange={empNumber => setSelectedEmployeeId(employeeByNumber.get(empNumber)?.id ?? '')}
          id="filter-guard-id"
          instanceId="filter-guard-id"
          allLabel="All Guard IDs"
        />
        <SelectFilter
          label="Site"
          value={filterSiteId}
          options={sites.map(s => ({ value: s.id, label: s.name }))}
          onChange={setFilterSiteId}
          id="filter-site"
          instanceId="filter-site"
          allLabel="All Sites"
        />
        <SelectFilter
          label="Status"
          value={filterStatus}
          options={[
            { value: 'generated', label: 'Generated' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'regenerated', label: 'Regenerated' },
          ]}
          onChange={setFilterStatus}
          id="filter-status"
          instanceId="filter-status"
          allLabel="All Statuses"
        />
      </FilterBar>

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
                  label="Employee No."
                  field="employeeNumber"
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
                  label="Status"
                  field="status"
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
                <th
                  className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  onClick={() => handleSort('generatedAt')}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      Created
                      {sortBy === 'generatedAt' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3" />
                      )}
                    </span>
                    <span className="text-muted-foreground/60">Downloads</span>
                  </div>
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
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {report.employee?.employeeNumber ?? '—'}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      {report.employee?.fullName ?? '—'}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(report.status)}`}>
                        {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                      </span>
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
                      <div>
                        {report.generatedAt
                          ? format(new Date(report.generatedAt), 'yyyy/MM/dd HH:mm')
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground/80">
                        Downloads: {report.downloadCount}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {selectedIds.size === 0 && (
                          report.downloadUrl ? (
                            <button
                              onClick={() => handleSingleDownload(report)}
                              disabled={downloadingIds.has(report.id)}
                              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                              title={downloadingIds.has(report.id) ? 'Downloading\u2026' : 'Download PDF'}
                            >
                              {downloadingIds.has(report.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
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
                            disabled={downloadingIds.has(report.id)}
                            aria-label={`Select report ${report.reportNumber ?? report.id}`}
                            className="h-4 w-4 rounded border-border text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
