'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import ChangelogExportModal from './changelog-export-modal';
import { format } from 'date-fns';

type ChangelogExportProps = {
  entityType?: string;
  entityId?: string;
};

export default function ChangelogExport({ entityType, entityId }: ChangelogExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const performExport = async (startDate: Date, endDate: Date) => {
    try {
      const params = new URLSearchParams();
      
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));
      
      if (entityType) params.set('entityType', entityType);
      if (entityId) params.set('entityId', entityId);

      const downloadUrl = `/api/admin/changelogs/export?${params.toString()}`;
      
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
        className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm w-full md:w-auto"
      >
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </button>

      <ChangelogExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={performExport}
      />
    </>
  );
}
