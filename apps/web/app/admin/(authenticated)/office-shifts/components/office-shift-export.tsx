'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import OfficeShiftExportModal from './office-shift-export-modal';

type OfficeShiftExportProps = {
  initialStartDate?: string;
  initialEndDate?: string;
  endpoint:
    | '/api/admin/office-shifts/export'
    | '/api/admin/office-shifts/day-offs/export'
    | '/api/admin/shifts/day-offs/export';
  title: string;
};

export default function OfficeShiftExport({ initialStartDate, initialEndDate, endpoint, title }: OfficeShiftExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const handleExport = (startDate: Date, endDate: Date) => {
    try {
      const params = new URLSearchParams();
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      window.location.href = `${endpoint}?${params.toString()}`;
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
        className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
      >
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </button>

      <OfficeShiftExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={title}
        initialStartDate={initialStartDate}
        initialEndDate={initialEndDate}
        onExport={handleExport}
      />
    </>
  );
}
