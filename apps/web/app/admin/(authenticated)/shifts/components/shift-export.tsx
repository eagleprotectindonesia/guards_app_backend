'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import ShiftExportModal from './shift-export-modal';
import { format } from 'date-fns';

type ShiftExportProps = {
  initialFilters: {
    startDate?: string;
    endDate?: string;
    guardId?: string;
    siteId?: string;
  };
};

export default function ShiftExport({ initialFilters }: ShiftExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const performExport = async (startDate: Date, endDate: Date) => {
    try {
      const params = new URLSearchParams();
      
      if (initialFilters.guardId) {
        params.set('guardId', initialFilters.guardId);
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
      <button
        onClick={() => setIsExportOpen(true)}
        className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
      >
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </button>

      <ShiftExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={performExport}
      />
    </>
  );
}
