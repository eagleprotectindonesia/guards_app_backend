'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import ChatExportModal from './chat-export-modal';
import { format } from 'date-fns';
import JSZip from 'jszip';

type ChatExportProps = {
  activeEmployeeId?: string | null;
  employees: { id: string; fullName: string }[];
};

export default function ChatExport({ activeEmployeeId, employees }: ChatExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const performExport = async (startDate: Date, endDate: Date, employeeId: string) => {
    const toastId = toast.loading('Preparing export...');
    try {
      const params = new URLSearchParams();
      params.set('employeeId', employeeId);
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));

      const response = await fetch(`/api/admin/chat/export?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch chat data');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read response');

      const decoder = new TextDecoder();
      let buffer = '';
      const messages: {
        id: string;
        createdAt: Date;
        sender: string;
        employee: { fullName: string };
        content: string;
        attachments: string[];
        admin?: { name: string };
      }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            messages.push(JSON.parse(line));
          }
        }
      }

      if (buffer.trim()) {
        messages.push(JSON.parse(buffer));
      }

      toast.loading(`Processing ${messages.length} messages and downloading attachments...`, { id: toastId });

      const zip = new JSZip();
      let chatTxt = '';
      const attachmentsFolder = zip.folder('attachments');

      for (const msg of messages) {
        const timestamp = format(new Date(msg.createdAt), 'dd/MM/yy, HH:mm:ss');
        const senderName = msg.sender === 'admin' ? `Admin (${msg.admin?.name || 'Unknown'})` : msg.employee.fullName;

        let line = `[${timestamp}] ${senderName}: ${msg.content || ''}`;

        if (msg.attachments && msg.attachments.length > 0) {
          const attachmentNames: string[] = [];
          for (let i = 0; i < msg.attachments.length; i++) {
            const url = msg.attachments[i];
            try {
              const filename = url.split('/').pop()?.split('?')[0] || `attachment_${msg.id}_${i}`;
              const attResponse = await fetch(url);
              if (attResponse.ok) {
                const blob = await attResponse.blob();
                attachmentsFolder?.file(filename, blob);
                attachmentNames.push(filename);
              } else {
                attachmentNames.push(`(Failed to download: ${filename})`);
              }
            } catch (err) {
              console.error('Failed to download attachment:', url, err);
              attachmentNames.push(`(Error downloading attachment)`);
            }
          }
          line += ` (Attachments: ${attachmentNames.join(', ')})`;
        }

        chatTxt += line + '\n';
      }

      zip.file('_chat.txt', chatTxt);

      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `chat_export_${employeeId}_${format(new Date(), 'yyyyMMdd')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      setIsExportOpen(false);
      toast.success('Export complete', { id: toastId });
    } catch (error) {
      console.error('Failed to export:', error);
      toast.error('Failed to export.', { id: toastId });
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
        Download History
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
