'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list'; // Assuming this type is available and suitable
import { useRecordAttendance } from '@/app/employee/(authenticated)/hooks/use-employee-queries'; // Adjust import path as necessary
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const attendanceMutation = useRecordAttendance();
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const handleRecordAttendance = async () => {
    setMessage('');
    setMessageType('');

    let locationData: { lat: number; lng: number } | undefined = undefined;

    if (navigator.geolocation) {
      setStatus(t('attendance.gettingLocation'));
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
        setMessage(t('attendance.locationRequired'));
        setMessageType('error');
        setStatus(t('attendance.locationFetchError'));
        return;
      }
    } else {
      setMessage(t('attendance.locationErrorMessage'));
      setMessageType('error');
      setStatus(t('attendance.locationErrorTitle'));
      return;
    }

    setStatus(t('attendance.recording'));

    try {
      await attendanceMutation.mutateAsync({ shiftId: shift.id, location: locationData });

      setMessage(t('attendance.success'));
      setMessageType('success');
      onAttendanceRecorded(); // Notify parent component to refresh shift data
      setStatus('Attendance Recorded'); // Update local status
    } catch (error: unknown) {
      console.error('Error recording attendance:', error);
      const errorMessage = error instanceof Error ? error.message : t('attendance.fail');
      setMessage(errorMessage);
      setMessageType('error');
      setStatus(t('attendance.fail'));
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
        <CardTitle className="text-2xl">{t('attendance.recordedTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasAttendance ? (
          <p className={`font-medium ${isLateAttendance ? 'text-yellow-600' : 'text-green-600'}`}>
            {isLateAttendance
              ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'MM/dd/yyyy HH:mm') })
              : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'MM/dd/yyyy HH:mm') })}
          </p>
        ) : isLateTime ? (
          <p className="text-red-600 font-bold">{t('attendance.notRecordedTitle')}</p>
        ) : (
          <p className="text-red-500 font-medium">{t('attendance.requiredMessage')}</p>
        )}

        {message && (
          <p className={`mt-2 text-sm ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
        )}

        {!hasAttendance && !isLateTime && (
          <>
            <Button
              onClick={handleRecordAttendance}
              disabled={attendanceMutation.isPending || !canRecordAttendance}
              className="mt-4 w-full"
            >
              {attendanceMutation.isPending ? t('attendance.recording') : t('attendance.submitButton')}
            </Button>
            {!canRecordAttendance && (
              <p className="text-sm text-gray-500 font-semibold mt-2">{t('attendance.alreadyRecorded')}</p>
            )}
          </>
        )}

        {isLateTime && !hasAttendance && (
          <p className="text-red-600 mt-2 font-medium">
            <i>{t('attendance.lateMessage')}</i>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
