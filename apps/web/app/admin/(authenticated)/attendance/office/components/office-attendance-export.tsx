'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useSession } from '../../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AttendanceOfficeSummary } from '@/types/attendance';
import OfficeAttendanceExportModal from './office-attendance-export-modal';

type OfficeAttendanceExportProps = {
  offices: AttendanceOfficeSummary[];
};

export default function OfficeAttendanceExport({ offices }: OfficeAttendanceExportProps) {
  const { hasPermission, canAccessOfficeAttendance } = useSession();
  const [isExportOpen, setIsExportOpen] = useState(false);

  const canExport = hasPermission(PERMISSIONS.ATTENDANCE.VIEW) && canAccessOfficeAttendance;

  if (!canExport) return null;

  const performExport = async (startDate: Date, endDate: Date, officeId?: string) => {
    try {
      const params = new URLSearchParams();
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      if (officeId) {
        params.set('officeId', officeId);
      }

      window.location.href = `/api/admin/office-attendance/export?${params.toString()}`;
      setIsExportOpen(false);
      toast.success('Export started');
    } catch (error) {
      console.error('Failed to start export:', error);
      toast.error('Failed to start export.');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsExportOpen(true)}
        className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
      >
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </button>

      <OfficeAttendanceExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={performExport}
        offices={offices}
      />
    </>
  );
}
