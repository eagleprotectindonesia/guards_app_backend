'use client';

import { useState } from 'react';
import { Prisma } from '@prisma/client';
import { SerializedChangelogWithAdminDto } from '@/types/changelogs';
import PaginationNav from '../../components/pagination-nav';
import { useSearchParams, usePathname } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { Eye } from 'lucide-react';
import ChangelogDetailsModal from './changelog-details-modal';
import { format, parseISO } from 'date-fns';
import ChangelogExport from './changelog-export';
import { useAdminRouter } from '../../context/admin-router';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';

const ACTION_OPTIONS = [
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'BULK_CREATE', label: 'Bulk Create' },
  { value: 'SWAP', label: 'Swap' },
  { value: 'REPLACEMENT', label: 'Replacement' },
];

type EntityFilterConfig = {
  urlKey: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
};

function getDisplayAction(log: SerializedChangelogWithAdminDto): string {
  const method = log.details && typeof log.details === 'object'
    ? (log.details as Record<string, unknown>).method
    : undefined;
  if (typeof method === 'string' && method) {
    return method;
  }
  return log.action;
}

function formatShiftValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return value.length > 10 ? format(date, 'PPP p') : format(date, 'PPP');
  }
  return String(value);
}

function summarizeLog(entityType: string, details: Prisma.JsonValue | undefined): string {
  if (!details || typeof details !== 'object') return '';
  const obj = details as Record<string, unknown>;
  const changes = obj.changes as Record<string, { from: unknown; to: unknown }> | undefined;

  const changeText = (changes?: Record<string, { from: unknown; to: unknown }>) =>
    changes && typeof changes === 'object'
      ? Object.entries(changes)
          .map(([key, value]) => {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/Id$/, '').trim();
            const fmt = (v: unknown) => (v === null || v === undefined ? 'None' : String(v));
            return `${label}: ${fmt(value.from)} → ${fmt(value.to)}`;
          })
          .join(', ')
      : '';

  switch (entityType) {
    case 'Shift': {
      const parts = [
        obj.employeeName,
        obj.siteName,
        obj.typeName,
        obj.date ? formatShiftValue('date', obj.date) : undefined,
        obj.status,
      ].filter(v => v !== undefined && v !== null && v !== '');
      const time =
        obj.startsAt && obj.endsAt
          ? `${formatShiftValue('startsAt', obj.startsAt)} – ${formatShiftValue('endsAt', obj.endsAt)}`
          : undefined;
      return [parts.join(' · '), time].filter(Boolean).join('  ·  ');
    }
    case 'OfficeShift': {
      const parts = [
        obj.employeeName,
        obj.officeShiftTypeName,
        obj.date ? formatShiftValue('date', obj.date) : undefined,
        obj.status,
      ].filter(v => v !== undefined && v !== null && v !== '');
      const time =
        obj.startsAt && obj.endsAt
          ? `${formatShiftValue('startsAt', obj.startsAt)} – ${formatShiftValue('endsAt', obj.endsAt)}`
          : undefined;
      return [parts.join(' · '), time].filter(Boolean).join('  ·  ');
    }
    case 'Employee': {
      const name = obj.fullName ?? obj.employeeName ?? obj.name;
      const sub = [obj.employeeNumber, obj.jobTitle, obj.role].filter(v => v !== undefined && v !== null && v !== '');
      return [name, sub.length ? `(${sub.join(', ')})` : null].filter(Boolean).join(' ');
    }
    case 'Site': {
      const parts = [obj.name, obj.clientName].filter(v => v !== undefined && v !== null && v !== '');
      const sub = [obj.address, obj.status].filter(v => v !== undefined && v !== null && v !== '');
      return [parts.join(' · '), sub.length ? sub.join(', ') : null].filter(Boolean).join('  ·  ');
    }
    case 'Office': {
      const sub = [obj.address, obj.note].filter(v => v !== undefined && v !== null && v !== '');
      return [obj.name ?? obj.title, sub.length ? sub.join(', ') : null].filter(Boolean).join('  ·  ');
    }
    case 'ShiftType':
    case 'OfficeShiftType': {
      const time =
        obj.startTime && obj.endTime
          ? `${String(obj.startTime)} – ${String(obj.endTime)}`
          : undefined;
      return [obj.name, time].filter(Boolean).join('  ·  ');
    }
    case 'OfficeWorkSchedule': {
      if (obj.employeeName || obj.changeCategory === 'officeWorkScheduleAssignment') {
        const parts = [
          obj.employeeName,
          obj.nextScheduleName ? `→ ${obj.nextScheduleName}` : undefined,
          obj.operationType,
        ].filter(v => v !== undefined && v !== null && v !== '');
        const eff =
          obj.effectiveFrom && obj.effectiveUntil
            ? `${formatShiftValue('effectiveFrom', obj.effectiveFrom)} → ${formatShiftValue('effectiveUntil', obj.effectiveUntil)}`
            : undefined;
        return [parts.join(' · '), eff].filter(Boolean).join('  ·  ');
      }
      return obj.name ? String(obj.name) : '';
    }
    default:
      return changeText(changes);
  }
}

type ChangelogListProps = {
  changelogs: SerializedChangelogWithAdminDto[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hideEntityType?: boolean;
  fixedEntityType?: string;
  exportEntityType?: string;
  showEntityName?: boolean;
  entityFilterConfig?: EntityFilterConfig;
  actionOptions?: { value: string; label: string }[];
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
  exportEntityType,
  showEntityName = false,
  entityFilterConfig,
  actionOptions = ACTION_OPTIONS,
}: ChangelogListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedLog, setSelectedLog] = useState<{ entityType: string; details: Prisma.JsonValue } | null>(null);
  const { apply } = useFilterUrlSync(pathname);

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    searchParams.get('startDate') ? parseISO(searchParams.get('startDate')!) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    searchParams.get('endDate') ? parseISO(searchParams.get('endDate')!) : undefined
  );
  const [filterAction, setFilterAction] = useState(searchParams.get('action') || '');
  const [filterEntityType, setFilterEntityType] = useState(searchParams.get('entityType') || '');
  const [filterEntity, setFilterEntity] = useState(
    entityFilterConfig ? searchParams.get(entityFilterConfig.urlKey) || '' : ''
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

  const handleApplyFilters = () => {
    const filters: Record<string, string | null> = {
      startDate: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : null,
      endDate: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
      action: filterAction || null,
    };

    if (!hideEntityType) {
      filters.entityType = filterEntityType || null;
    }

    if (entityFilterConfig) {
      filters[entityFilterConfig.urlKey] = filterEntity || null;
    }

    apply(filters);
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterAction('');
    setFilterEntityType('');
    setFilterEntity('');

    const filters: Record<string, null> = {
      startDate: null,
      endDate: null,
      action: null,
    };

    if (!hideEntityType) {
      filters.entityType = null;
    }

    if (entityFilterConfig) {
      filters[entityFilterConfig.urlKey] = null;
    }

    apply(filters);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {fixedEntityType ? `${fixedEntityType} Audit Log` : 'Audit Log'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fixedEntityType
              ? `Track changes for ${fixedEntityType}s.`
              : 'Track system changes and administrative actions.'}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <ChangelogExport entityType={exportEntityType ?? fixedEntityType} />
        </div>
      </div>

      {/* Filters */}
      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        <SelectFilter
          label="Action"
          value={filterAction}
          options={actionOptions}
          onChange={setFilterAction}
          id="filter-action"
          instanceId="filter-action"
          allLabel="All actions"
        />
        {!hideEntityType && (
          <SelectFilter
            label="Entity Type"
            value={filterEntityType}
            options={[
              { value: 'Employee', label: 'Employee' },
              { value: 'Site', label: 'Site' },
              { value: 'Shift', label: 'Shift' },
              { value: 'Alert', label: 'Alert' },
            ]}
            onChange={setFilterEntityType}
            id="filter-entity-type"
            instanceId="filter-entity-type"
            allLabel="All entities"
          />
        )}
        {entityFilterConfig && (
          <SelectFilter
            label={entityFilterConfig.label}
            value={filterEntity}
            options={entityFilterConfig.options}
            onChange={setFilterEntity}
            id="filter-entity"
            instanceId="filter-entity"
            allLabel={entityFilterConfig.allLabel}
          />
        )}
        <DateRangeFilter
          from={filterStartDate}
          to={filterEndDate}
          onChange={(from, to) => {
            setFilterStartDate(from);
            setFilterEndDate(to);
          }}
        />
      </FilterBar>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <SortableHeader
                  label="Date"
                  field="createdAt"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="pl-6"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actor</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Action</th>
                {!hideEntityType && (
                  <SortableHeader
                    label="Entity Type"
                    field="entityType"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                  />
                )}
                {showEntityName && (
                  <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                )}
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {changelogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={hideEntityType ? (showEntityName ? 6 : 5) : showEntityName ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No logs found.
                  </td>
                </tr>
              ) : (
                changelogs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-4 px-6 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      {log.actor === 'system' ? (
                        <span className="text-muted-foreground/70 italic bg-muted/50 px-2 py-0.5 rounded text-xs">
                          System
                        </span>
                      ) : log.actor === 'admin' ? (
                        log.admin?.name || 'Administrator'
                      ) : log.actor === 'employee' ? (
                        log.employee?.fullName ?? 'Employee'
                      ) : (
                        <span className="text-muted-foreground/50 italic">Unknown</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {(() => {
                        const action = getDisplayAction(log);
                        return (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                            ${
                              action === 'CREATE' || action === 'BULK_CREATE'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                : action === 'DELETE'
                                  ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400'
                                  : action === 'SWAP'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                                    : action === 'REPLACEMENT'
                                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            }`}
                          >
                            {action}
                          </span>
                        );
                      })()}
                    </td>
                    {!hideEntityType && <td className="py-4 px-6 text-sm text-muted-foreground">{log.entityType}</td>}
                    {showEntityName && (
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {(() => {
                          if (!log.details || typeof log.details !== 'object') return '-';
                          const d = log.details as Record<string, unknown>;
                          return String(d.name ?? d.title ?? '-');
                        })()}
                      </td>
                    )}
                    <td className="py-4 px-6 text-sm text-muted-foreground max-w-[280px] truncate" title={summarizeLog(log.entityType, log.details)}>
                      {summarizeLog(log.entityType, log.details) || '-'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedLog({ entityType: log.entityType, details: log.details })}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer"
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
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        entityType={selectedLog?.entityType ?? null}
        details={
          selectedLog?.details as Record<string, string> | { changes: Record<string, { from: string; to: string }> } | null
        }
      />
    </div>
  );
}
