'use client';

import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

type ChangelogExportProps = {
  entityType?: string;
  entityId?: string;
};

export default function ChangelogExport({ entityType, entityId }: ChangelogExportProps) {
  const searchParams = useSearchParams();

  const performExport = async () => {
    try {
      const params = new URLSearchParams();

      const filterKeys = ['startDate', 'endDate', 'action', 'entityType', 'entityId'];

      for (const key of filterKeys) {
        const value = searchParams.get(key);
        if (value) {
          params.set(key, value);
        }
      }

      if (entityType) {
        params.set('entityType', entityType);
      }

      if (entityId) {
        params.set('entityId', entityId);
      }

      const downloadUrl = `/api/admin/changelogs/export?${params.toString()}`;
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Data is empty.');
          return;
        }

        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || 'changelog_export.csv';
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      toast.success('Export started');
    } catch (error) {
      console.error('Failed to start export:', error);
      toast.error('Failed to start export.');
    }
  };

  return (
    <>
      <button
        onClick={performExport}
        className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm w-full md:w-auto"
      >
        <Download className="w-4 h-4 mr-2" />
        Download CSV
      </button>
    </>
  );
}
