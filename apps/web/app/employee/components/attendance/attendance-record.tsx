'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRecordAttendance } from '@/app/employee/(authenticated)/hooks/use-employee-queries'; // Adjust import path as necessary
import type { EmployeeShift } from '@/app/employee/(authenticated)/hooks/use-employee-queries';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
  getCurrentPositionWithFallback,
  resolveBrowserPositionFetcher,
} from '@/app/employee/(authenticated)/utils/geolocation';
import { getEmployeeAttendanceCheckinErrorPayload, resolveEmployeeAttendanceCheckinErrorMessage } from '@repo/shared';
import { getSentryClientContext } from '@/lib/sentry-client-context';

interface AttendanceRecordProps {
  shift: EmployeeShift;
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

  const addBreadcrumb = (message: string, data?: Record<string, unknown>, level: 'info' | 'error' = 'info') => {
    Sentry.addBreadcrumb({
      category: 'attendance.record',
      message,
      level,
      data,
    });
  };

  const captureAttendanceException = async (error: unknown, stage: string, extra?: Record<string, unknown>) => {
    const context = await getSentryClientContext();
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'employee_attendance_record');
      scope.setTag('attendance_stage', stage);
      scope.setContext('attendance', {
        shiftId: shift.id,
        hasAttendance: !!shift.attendance,
        mutationPending: attendanceMutation.isPending,
        ...extra,
      });
      scope.setContext('client', context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  };

  const handleRecordAttendance = async () => {
    addBreadcrumb('attendance.record.click', { shiftId: shift.id });
    setMessage('');
    setMessageType('');

    let locationData: { lat: number; lng: number } | undefined = undefined;

    if (navigator.geolocation) {
      addBreadcrumb('attendance.record.status.update', { status: 'gettingLocation' });
      setStatus(t('attendance.gettingLocation'));
      try {
        addBreadcrumb('attendance.record.geolocation.start', { geolocationAvailable: true });
        const position = await getCurrentPositionWithFallback(resolveBrowserPositionFetcher(navigator.geolocation));
        locationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        addBreadcrumb('attendance.record.geolocation.success', { hasLocation: !!locationData });
      } catch (error) {
        addBreadcrumb(
          'attendance.record.geolocation.failure',
          { error: error instanceof Error ? error.message : String(error) },
          'error'
        );
        console.warn('[Attendance] Geolocation unavailable after fallback attempts.', {
          shiftId: shift.id,
          error,
        });
        console.error('Geolocation failed or timed out:', error);
        setMessage(t('attendance.locationRequired'));
        setMessageType('error');
        addBreadcrumb('attendance.record.status.update', { status: 'locationFetchError' });
        setStatus(t('attendance.locationFetchError'));
        await captureAttendanceException(error, 'geolocation', { geolocationAvailable: true });
        return;
      }
    } else {
      addBreadcrumb('attendance.record.geolocation.unavailable', { geolocationAvailable: false }, 'error');
      setMessage(t('attendance.locationErrorMessage'));
      setMessageType('error');
      addBreadcrumb('attendance.record.status.update', { status: 'locationErrorTitle' });
      setStatus(t('attendance.locationErrorTitle'));
      await captureAttendanceException(new Error('Geolocation API unavailable in browser'), 'geolocation_unavailable', {
        geolocationAvailable: false,
      });
      return;
    }

    addBreadcrumb('attendance.record.status.update', { status: 'recording' });
    setStatus(t('attendance.recording'));

    try {
      addBreadcrumb('attendance.record.request.start', { shiftId: shift.id, hasLocation: !!locationData });
      await attendanceMutation.mutateAsync({ shiftId: shift.id, location: locationData });

      addBreadcrumb('attendance.record.mutation.success', { shiftId: shift.id });
      setMessage(t('attendance.success'));
      setMessageType('success');
      onAttendanceRecorded(); // Notify parent component to refresh shift data
      addBreadcrumb('attendance.record.status.update', { status: 'Attendance Recorded' });
      setStatus('Attendance Recorded'); // Update local status
    } catch (error: unknown) {
      addBreadcrumb(
        'attendance.record.mutation.error',
        { error: error instanceof Error ? error.message : String(error) },
        'error'
      );
      console.error('Error recording attendance:', error);
      const errorData = getEmployeeAttendanceCheckinErrorPayload(error);
      const errorMessage = resolveEmployeeAttendanceCheckinErrorMessage(
        t,
        {
          code: errorData.code,
          fallbackMessage: errorData.message || errorData.error || (error instanceof Error ? error.message : undefined),
          details: errorData.details,
        },
        t('attendance.fail'),
        'attendance'
      );
      setMessage(errorMessage);
      setMessageType('error');
      addBreadcrumb('attendance.record.status.update', { status: 'fail' });
      setStatus(t('attendance.fail'));
      await captureAttendanceException(error, 'mutation', {
        code: errorData.code,
      });
    }
  };

  // Determine if attendance can be recorded
  const hasAttendance = !!shift.attendance;

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
                  ? 'bg-linear-to-br from-red-600 to-red-800 shadow-red-600/40'
                  : 'bg-linear-to-br from-blue-600 to-blue-800 shadow-blue-600/40'
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
