'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import AttendanceExportModal from './attendance-export-modal';
import { format } from 'date-fns';
import { Serialized } from '@/lib/utils';
import { Guard } from '@prisma/client';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type AttendanceExportProps = {
  initialFilters: {
    startDate?: string;
    endDate?: string;
    guardId?: string;
  };
  guards: Serialized<Guard>[];
};

export default function AttendanceExport({ initialFilters, guards }: AttendanceExportProps) {
  const { hasPermission } = useSession();
  const [isExportOpen, setIsExportOpen] = useState(false);

  const canExport = hasPermission(PERMISSIONS.ATTENDANCE.VIEW);

  if (!canExport) return null;

  const performExport = async (startDate: Date, endDate: Date, selectedGuardId?: string) => {
    try {
      const params = new URLSearchParams();
      
      const guardIdToUse = selectedGuardId || initialFilters.guardId;
      if (guardIdToUse) {
        params.set('guardId', guardIdToUse);
      }
      
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      const downloadUrl = `/api/admin/attendance/export?${params.toString()}`;
      
      // Trigger download
      window.location.href = downloadUrl;
      
      // Close modal
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

      <AttendanceExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={performExport}
        guards={guards}
      />
    </>
  );
}
