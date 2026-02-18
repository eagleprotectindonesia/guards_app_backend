'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import ShiftExportModal from './shift-export-modal';
import { format } from 'date-fns';

type ShiftExportProps = {
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    siteId?: string;
  };
};

export default function ShiftExport({ initialFilters }: ShiftExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const performExport = async (startDate: Date, endDate: Date) => {
    try {
      const params = new URLSearchParams();

      if (initialFilters.employeeId) {
        params.set('employeeId', initialFilters.employeeId);
      }

      if (initialFilters.siteId) {
        params.set('siteId', initialFilters.siteId);
      }

      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      const downloadUrl = `/api/admin/shifts/export?${params.toString()}`;

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
      <Button variant="outline" onClick={() => setIsExportOpen(true)} className="font-semibold">
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </Button>

      <ShiftExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} onExport={performExport} />
    </>
  );
}
