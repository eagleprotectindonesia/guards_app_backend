'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

type ChatExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date, target: { kind: 'direct' | 'group'; id: string; title: string }) => void;
  targets: { kind: 'direct' | 'group'; id: string; title: string }[];
  initialTarget?: { kind: 'direct' | 'group'; id: string };
};

export default function ChatExportModal({
  isOpen,
  onClose,
  onExport,
  targets,
  initialTarget,
}: ChatExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const initialTargetKey = initialTarget ? `${initialTarget.kind}:${initialTarget.id}` : '';
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>(initialTargetKey);

  if (isOpen && initialTargetKey && selectedTargetKey === '') {
    setSelectedTargetKey(initialTargetKey);
  }

  const handleExport = () => {
    if (!selectedTargetKey) {
      toast.error('Please select a conversation.');
      return;
    }

    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates.');
      return;
    }

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date.');
      return;
    }

    const daysDifference = differenceInDays(endDate, startDate);
    if (daysDifference > 62) {
      toast.error('Date range cannot exceed 62 days.');
      return;
    }

    const [kind, id] = selectedTargetKey.split(':');
    const target = targets.find(t => t.kind === kind && t.id === id);
    if (!target) {
      toast.error('Invalid conversation selection.');
      return;
    }
    onExport(startDate, endDate, target);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Export Chat History (ZIP)</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">Select a conversation and date range to export chat history and attachments.</p>

        <div className="space-y-4">
          {/* Conversation Selection */}
          <div>
            <Label htmlFor="conversation">
              Conversation <span className="text-red-500">*</span>
            </Label>
            <select
              id="conversation"
              value={selectedTargetKey}
              onChange={e => setSelectedTargetKey(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" disabled className="bg-card">
                Select a Conversation
              </option>
              {targets.map(target => (
                <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`} className="bg-card">
                  {target.kind === 'group' ? '[Group] ' : ''}{target.title}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="export-start-date">
              Start Date <span className="text-red-500">*</span>
            </Label>
            <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} className="mt-1" />
          </div>

          {/* End Date */}
          <div>
            <Label htmlFor="export-end-date">
              End Date <span className="text-red-500">*</span>
            </Label>
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              minDate={startDate}
              maxDate={startDate ? addDays(startDate, 62) : undefined}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleExport} type="button">
            Download ZIP
          </Button>
        </div>
      </div>
    </div>
  );
}
