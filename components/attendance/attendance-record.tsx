'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list'; // Assuming this type is available and suitable
import { useGuardApi } from '@/app/guard/(authenticated)/hooks/use-guard-api'; // Adjust import path as necessary
import { format } from 'date-fns';

interface AttendanceRecordProps {
  shift: ShiftWithRelations;
  onAttendanceRecorded: () => void;
  status: string; // Current status of the shift, e.g., 'active', 'pending attendance', etc.
  setStatus: (status: string) => void;
}

export function AttendanceRecord({ shift, onAttendanceRecorded, status, setStatus }: AttendanceRecordProps) {
  const { fetchWithAuth } = useGuardApi();
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const handleRecordAttendance = async () => {
    setIsRecording(true);
    setMessage('');
    setMessageType('');
    try {
      const res = await fetchWithAuth(`/api/shifts/${shift.id}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftId: shift.id }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to record attendance');
      }

      setMessage('Attendance recorded successfully!');
      setMessageType('success');
      onAttendanceRecorded(); // Notify parent component to refresh shift data
      setStatus('Attendance Recorded'); // Update local status
    } catch (error: any) {
      console.error('Error recording attendance:', error);
      setMessage(error.message || 'An unexpected error occurred.');
      setMessageType('error');
    } finally {
      setIsRecording(false);
    }
  };

  // Determine if attendance can be recorded
  const hasAttendance = !!shift.attendance;
  const canRecordAttendance = !hasAttendance;

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white mb-4">
      <h3 className="text-lg font-semibold mb-2">Attendance Status</h3>
      {hasAttendance ? (
        <p className="text-green-600 font-medium">
          Attendance recorded at {format(new Date(shift.attendance!.recordedAt), 'MM/dd/yyyy HH:mm')}
        </p>
      ) : (
        <p className="text-red-500 font-medium">Please record your attendance to start the shift.</p>
      )}

      {message && (
        <p className={`mt-2 text-sm ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
      )}

      {!hasAttendance && (
        <>
          <Button
            onClick={handleRecordAttendance}
            disabled={isRecording || !canRecordAttendance}
            className="mt-4 w-full"
          >
            {isRecording ? 'Recording...' : 'Record Attendance'}
          </Button>
          {!canRecordAttendance && (
            <p className="text-sm text-gray-500 mt-2">Attendance has already been recorded for this shift.</p>
          )}
        </>
      )}
    </div>
  );
}
