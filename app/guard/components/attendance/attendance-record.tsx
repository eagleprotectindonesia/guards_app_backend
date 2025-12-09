'use client';

import { useState } from 'react';
import { Button } from '@/app/guard/components/ui/button';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list'; // Assuming this type is available and suitable
import { useGuardApi } from '@/app/guard/(authenticated)/hooks/use-guard-api'; // Adjust import path as necessary
import { format } from 'date-fns';

interface AttendanceRecordProps {
  shift: ShiftWithRelations;
  onAttendanceRecorded: () => void;
  status: string; // Current status of the shift, e.g., 'active', 'pending attendance', etc.
  setStatus: (status: string) => void;
  currentTime?: Date; // Optional for backward compatibility, but recommended
}

export function AttendanceRecord({
  shift,
  onAttendanceRecorded,
  status,
  setStatus,
  currentTime,
}: AttendanceRecordProps) {
  const { fetchWithAuth } = useGuardApi();
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const handleRecordAttendance = async () => {
    setIsRecording(true);
    setMessage('');
    setMessageType('');

    let locationData: { lat: number; lng: number } | undefined;

    if (navigator.geolocation) {
      setStatus('Mendapatkan lokasi...');
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
        });
        locationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } catch (error) {
        console.warn('Geolocation failed or timed out:', error);
        // Continue without location
      }
    }

    setStatus('Merekam...');

    try {
      const res = await fetchWithAuth(`/api/shifts/${shift.id}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftId: shift.id, location: locationData }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal merekam kehadiran');
      }

      setMessage('Kehadiran berhasil direkam!');
      setMessageType('success');
      onAttendanceRecorded(); // Notify parent component to refresh shift data
      setStatus('Attendance Recorded'); // Update local status
    } catch (error: unknown) {
      console.error('Error recording attendance:', error);
      setMessage(error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.');
      setMessageType('error');
      setStatus('Gagal merekam kehadiran');
    } finally {
      setIsRecording(false);
    }
  };

  // Determine if attendance can be recorded
  const hasAttendance = !!shift.attendance;
  const canRecordAttendance = !hasAttendance;

  // Calculate late status
  const ATTENDANCE_GRACE_MINS = 5;
  const now = currentTime || new Date();
  const startMs = new Date(shift.startsAt).getTime();
  const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;
  const isLate = !hasAttendance && now.getTime() > graceEndMs;

  return (
    <div className={`p-4 border rounded-lg shadow-sm mb-4 ${isLate ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
      <h3 className="text-lg font-semibold mb-2">Status Kehadiran</h3>
      {hasAttendance ? (
        <p className="text-green-600 font-medium">
          Kehadiran direkam pada {format(new Date(shift.attendance!.recordedAt), 'MM/dd/yyyy HH:mm')}
        </p>
      ) : isLate ? (
        <p className="text-red-600 font-bold">Kehadiran Hilang</p>
      ) : (
        <p className="text-red-500 font-medium">Harap rekam kehadiran Anda untuk memulai Shift.</p>
      )}

      {message && (
        <p className={`mt-2 text-sm ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
      )}

      {!hasAttendance && !isLate && (
        <>
          <Button
            onClick={handleRecordAttendance}
            disabled={isRecording || !canRecordAttendance}
            className="mt-4 w-full"
          >
            {isRecording ? 'Merekam...' : 'Rekam Kehadiran'}
          </Button>
          {!canRecordAttendance && (
            <p className="text-sm text-gray-500 mt-2">Kehadiran sudah direkam untuk Shift ini.</p>
          )}
        </>
      )}

      {isLate && !hasAttendance && (
        <p className="text-red-600 mt-2 font-medium">Jendela kehadiran terlewat. Harap hubungi administrator Anda.</p>
      )}
    </div>
  );
}
