'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import ChatExportModal from './chat-export-modal';
import { format } from 'date-fns';

type ChatExportProps = {
  activeEmployeeId?: string | null;
  employees: { id: string; fullName: string }[];
};

export default function ChatExport({ activeEmployeeId, employees }: ChatExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const performExport = async (startDate: Date, endDate: Date, employeeId: string) => {
    try {
      const params = new URLSearchParams();
      
      params.set('employeeId', employeeId);
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      const downloadUrl = `/api/admin/chat/export?${params.toString()}`;
      
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
        className="inline-flex items-center justify-center h-9 px-3 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
        title="Download Chat History"
      >
        <Download className="w-4 h-4 mr-2" />
        Export
      </button>

      <ChatExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={performExport}
        employees={employees}
        initialEmployeeId={activeEmployeeId || undefined}
      />
    </>
  );
}
