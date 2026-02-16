'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { useRecordAttendance } from '@/app/employee/(authenticated)/hooks/use-employee-queries'; // Adjust import path as necessary
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

interface AttendanceRecordProps {
  shift: ShiftWithRelationsDto;
  onAttendanceRecorded: () => void;
  status: string; // Current status of the shift, e.g., 'active', 'pending attendance', etc.
  setStatus: (status: string) => void;
  currentTime?: Date; // Optional for backward compatibility, but recommended
}

export function AttendanceRecord({ shift, onAttendanceRecorded, setStatus, currentTime }: AttendanceRecordProps) {
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
    <div
      className={`mb-4 rounded-2xl p-5 border transition-all duration-300 ${
        hasAttendance
          ? isLateAttendance
            ? 'bg-[#111111] border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
            : 'bg-[#111111] border-green-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
          : isLateTime
            ? 'bg-[#111111] border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
            : 'bg-[#111111] border-white/10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]'
      }`}
    >
      <div className="flex flex-col gap-1">
        <h3
          className={`text-lg font-bold mb-1 ${
            hasAttendance ? (isLateAttendance ? 'text-amber-500' : 'text-green-500') : 'text-white'
          }`}
        >
          {hasAttendance
            ? isLateAttendance
              ? t('attendance.lateTitle')
              : t('attendance.recordedTitle')
            : isLateTime
              ? t('attendance.notRecordedTitle')
              : t('attendance.requiredTitle')}
        </h3>

        {hasAttendance ? (
          <p className="text-neutral-400 text-sm">
            {isLateAttendance
              ? t('attendance.recordedLateAt', {
                  date: format(new Date(shift.attendance!.recordedAt), 'PPpp'),
                })
              : t('attendance.recordedAt', {
                  date: format(new Date(shift.attendance!.recordedAt), 'PPpp'),
                })}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {isLateTime ? (
              <p className="text-red-400 font-bold text-base">{t('attendance.lateMessage')}</p>
            ) : (
              <p className="text-neutral-400 text-sm">{t('attendance.requiredMessage')}</p>
            )}

            {message && (
              <p className={`text-sm font-medium ${messageType === 'success' ? 'text-green-400' : 'text-blue-400'}`}>
                {message}
              </p>
            )}

            <button
              onClick={handleRecordAttendance}
              disabled={attendanceMutation.isPending}
              className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-sm text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isLateTime
                  ? 'bg-gradient-to-br from-red-600 to-red-800 shadow-red-600/40'
                  : 'bg-gradient-to-br from-blue-600 to-blue-800 shadow-blue-600/40'
              } ${attendanceMutation.isPending ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              {attendanceMutation.isPending && (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {isLateTime
                ? t('attendance.submitLateButton', { defaultValue: 'Record Late Attendance' })
                : t('attendance.submitButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
