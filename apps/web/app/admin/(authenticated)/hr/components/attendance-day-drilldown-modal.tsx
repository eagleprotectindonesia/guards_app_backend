'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@repo/shared';
import { format } from 'date-fns';

type EmployeeRow = {
  employeeId: string;
  fullName: string;
  employeeNumber: string;
  department: string | null;
  role: string;
  status: string;
  locationName: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  departments?: string[];
  officeIds?: string[];
  siteIds?: string[];
};

const statusColors: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-600',
  late: 'bg-amber-500/10 text-amber-600',
  absent: 'bg-red-500/10 text-red-600',
  clocked_out: 'bg-blue-500/10 text-blue-600',
};

export function AttendanceDayDrilldownModal({ isOpen, onClose, date, departments, officeIds, siteIds }: Props) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadingId = setTimeout(() => {
      if (!cancelled) {
        setEmployees([]);
        setLoading(true);
        setError(null);
      }
    }, 0);

    const params = new URLSearchParams({ date });
    if (departments?.length) params.set('department', departments.join(','));
    const locParts: string[] = [
      ...(officeIds || []).map((id) => `o:${id}`),
      ...(siteIds || []).map((id) => `s:${id}`),
    ];
    if (locParts.length) params.set('location', locParts.join(','));

    fetch(`/api/admin/attendance/day-summary?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch attendance data');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setEmployees(data.employees || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(loadingId);
    };
  }, [isOpen, date, departments, officeIds, siteIds]);

  const parsedDate = new Date(date);
  const formattedDate = isNaN(parsedDate.getTime()) ? date : format(parsedDate, 'EEEE, MMM d, yyyy');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col" showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center justify-between shrink-0">
          <DialogTitle className="text-base font-bold">Attendance — {formattedDate}</DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-500 text-sm">{error}</div>
        ) : employees.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No attendance records for this date.
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left font-semibold text-muted-foreground py-2 px-3">Employee</th>
                  <th className="text-left font-semibold text-muted-foreground py-2 px-3">ID</th>
                  <th className="text-left font-semibold text-muted-foreground py-2 px-3">Department</th>
                  <th className="text-left font-semibold text-muted-foreground py-2 px-3">Location</th>
                  <th className="text-center font-semibold text-muted-foreground py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.employeeId} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{emp.fullName}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{emp.employeeNumber}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{emp.department || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{emp.locationName || '—'}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize',
                          statusColors[emp.status] || 'bg-muted text-muted-foreground'
                        )}
                      >
                        {emp.status === 'clocked_out' ? 'Present' : emp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border/40 shrink-0 text-xs text-muted-foreground">
          <span>{employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
          <span>
            {employees.filter((e) => e.status === 'present' || e.status === 'clocked_out').length} present,{' '}
            {employees.filter((e) => e.status === 'late').length} late,{' '}
            {employees.filter((e) => e.status === 'absent').length} absent
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
