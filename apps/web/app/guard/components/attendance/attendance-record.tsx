'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list'; // Assuming this type is available and suitable
import { useGuardApi } from '@/app/guard/(authenticated)/hooks/use-guard-api'; // Adjust import path as necessary
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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

    let locationData: { lat: number; lng: number } | null = null;

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
        console.error('Geolocation failed or timed out:', error);
        setIsRecording(false);
        setMessage('Lokasi diperlukan untuk merekam kehadiran. Pastikan izin lokasi diaktifkan dan coba lagi.');
        setMessageType('error');
        setStatus('Gagal mendapatkan lokasi');
        return;
      }
    } else {
      setIsRecording(false);
      setMessage('Layanan lokasi tidak tersedia di perangkat ini. Lokasi diperlukan untuk merekam kehadiran.');
      setMessageType('error');
      setStatus('Layanan lokasi tidak tersedia');
      return;
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
        // The API will return the distance exceeded error message as part of errorData.error
        throw new Error(errorData.error || errorData.message || 'Gagal merekam kehadiran');
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

  // Check if attendance was marked as late due to forgiveness
  const isLateAttendance = hasAttendance && shift.attendance?.status === 'late';

  // Check if it's currently late and no attendance has been recorded
  const isLateTime = !hasAttendance && now.getTime() > graceEndMs;

  return (
    <Card
      className={`mb-4 shadow-sm ${
        isLateTime ? 'bg-red-50 border-red-200' : isLateAttendance ? 'bg-yellow-50 border-yellow-200' : 'bg-white'
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl">Status Kehadiran</CardTitle>
      </CardHeader>
      <CardContent>
        {hasAttendance ? (
          <p className={`font-medium ${isLateAttendance ? 'text-yellow-600' : 'text-green-600'}`}>
            {isLateAttendance
              ? `Kehadiran direkam sebagai terlambat pada ${format(
                  new Date(shift.attendance!.recordedAt),
                  'MM/dd/yyyy HH:mm'
                )}`
              : `Kehadiran direkam pada ${format(new Date(shift.attendance!.recordedAt), 'MM/dd/yyyy HH:mm')}`}
          </p>
        ) : isLateTime ? (
          <p className="text-red-600 font-bold">Kehadiran Tidak Terekam</p>
        ) : (
          <p className="text-red-500 font-medium">Harap rekam kehadiran Anda untuk memulai Shift.</p>
        )}

        {message && (
          <p className={`mt-2 text-sm ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
        )}

        {!hasAttendance && !isLateTime && (
          <>
            <Button
              onClick={handleRecordAttendance}
              disabled={isRecording || !canRecordAttendance}
              className="mt-4 w-full"
            >
              {isRecording ? 'Merekam...' : 'Rekam Kehadiran'}
            </Button>
            {!canRecordAttendance && (
              <p className="text-sm text-gray-500 font-semibold mt-2">Kehadiran sudah direkam untuk Shift ini.</p>
            )}
          </>
        )}

        {isLateTime && !hasAttendance && (
          <p className="text-red-600 mt-2 font-medium">
            <i>Batas waktu presensi terlewat. Harap hubungi administrator Anda.</i>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
