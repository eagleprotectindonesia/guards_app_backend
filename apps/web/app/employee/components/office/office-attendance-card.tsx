'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  useRecordOfficeAttendance,
  useOfficeAttendance,
} from '@/app/employee/(authenticated)/hooks/use-employee-queries';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, LogOut, MapPin, CalendarDays } from 'lucide-react';
import { getOfficeScheduleDisplayState } from './office-attendance-card-utils';

interface OfficeAttendanceCardProps {
  office?: { id: string; name: string } | null;
  onAttendanceRecorded?: () => void;
}

export function OfficeAttendanceCard({ office, onAttendanceRecorded }: OfficeAttendanceCardProps) {
  const { t } = useTranslation();
  const { data, refetch: refetchAttendance } = useOfficeAttendance();
  const todayAttendances = data?.attendances;
  const scheduleContext = data?.scheduleContext;
  const attendanceState = data?.attendanceState;
  const scheduleDisplay = getOfficeScheduleDisplayState(scheduleContext, attendanceState);
  
  const recordMutation = useRecordOfficeAttendance();
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const latestAttendance = scheduleDisplay.latestAttendance ?? todayAttendances?.[0];
  const isClockedIn = scheduleDisplay.isClockedIn;
  const hasClockedOut = scheduleDisplay.isCompleted;

  const handleRecordAttendance = async (status: 'present' | 'clocked_out') => {
    setMessage('');
    setMessageType('');

    let locationData: { lat: number; lng: number } | undefined = undefined;

    if (navigator.geolocation) {
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
        return;
      }
    }

    try {
      await recordMutation.mutateAsync({
        location: locationData,
        status,
      });

      setMessage(status === 'present' ? t('attendance.success') : t('officeAttendance.clockOutSuccess'));
      setMessageType('success');
      refetchAttendance();
      if (onAttendanceRecorded) onAttendanceRecorded();
    } catch (error: unknown) {
      console.error('Error recording office attendance:', error);
      const errorMessage = error instanceof Error ? error.message : t('attendance.fail');
      setMessage(errorMessage);
      setMessageType('error');
    }
  };

  return (
    <Card className="mb-4 shadow-xl bg-[#0F0F0F] border-neutral-800 text-white relative overflow-hidden">
      {/* Premium Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />

      <CardHeader className="pb-4 border-b border-neutral-800">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 text-neutral-100">
              <Clock className="w-5 h-5 text-blue-400" />
              {t('officeAttendance.title', { defaultValue: 'Office Attendance' })}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400">
              <MapPin className="w-4 h-4" />
              <span>{office?.name || t('officeAttendance.noOfficeAssigned', { defaultValue: 'Remote / No Office Assigned' })}</span>
            </div>
          </div>
          {scheduleDisplay.isWorkingDay && (
            <div className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              {t('officeAttendance.workingDay', { defaultValue: 'Working Day' })}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 relative z-10">
        {scheduleContext && scheduleDisplay.isWorkingDay ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-neutral-300 mb-2 font-medium">
              <CalendarDays className="w-4 h-4 text-blue-400" />
              {scheduleDisplay.scheduleName || 'Assigned Schedule'}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">Date:</span>
              <span className="text-neutral-100">{scheduleDisplay.businessDate || '-'}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-neutral-500">Window:</span>
              <span className="text-neutral-100 font-mono tracking-wider text-green-400">
                {scheduleDisplay.scheduledStartStr || '--:--'} - {scheduleDisplay.scheduledEndStr || '--:--'}
              </span>
            </div>
          </div>
        ) : scheduleContext ? (
           <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6 text-center text-neutral-400">
             {t('officeAttendance.nonWorkingDay', { defaultValue: 'No active schedule for today. It is marked as a day off.' })}
           </div>
        ) : null}

        {isClockedIn ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-green-400 font-medium">
              <CheckCircle2 className="w-6 h-6" />
              <div className="flex flex-col">
                <span className="text-sm opacity-80">{t('officeAttendance.clockedIn', { defaultValue: 'Clocked In At' })}</span>
                <span className="text-xl font-bold font-mono">{latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm:ss') : '--:--:--'}</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => handleRecordAttendance('clocked_out')}
              disabled={recordMutation.isPending}
              className="w-full h-14 text-lg border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 transition-all font-semibold"
            >
              {recordMutation.isPending ? (
                t('common.loading')
              ) : (
                <span className="flex items-center gap-2">
                  <LogOut className="w-5 h-5" />
                  {t('officeAttendance.clockOut', { defaultValue: 'Clock Out' })}
                </span>
              )}
            </Button>
          </div>
        ) : hasClockedOut ? (
           <div className="space-y-4">
            <div className="flex items-center gap-3 bg-neutral-800 border border-neutral-700 p-4 rounded-xl text-neutral-300 font-medium">
              <CheckCircle2 className="w-6 h-6 text-neutral-500" />
              <div className="flex flex-col">
                <span className="text-sm opacity-80">{t('officeAttendance.dayCompleted', { defaultValue: 'Day Completed' })}</span>
                <span className="text-sm text-neutral-500">{t('officeAttendance.clockOutTime', { defaultValue: 'Clock Out:' })} {latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm') : '--:--'}</span>
              </div>
            </div>
          </div>
        ) : scheduleDisplay.isMissed ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-300 font-medium">
              <Clock className="w-6 h-6" />
              <div className="flex flex-col">
                <span className="text-sm opacity-80">{t('officeAttendance.missedTitle', { defaultValue: 'Attendance Window Missed' })}</span>
                <span className="text-sm text-amber-200">
                  {t('officeAttendance.missedMessage', {
                    defaultValue: 'The configured office attendance window has ended without a clock-in record.',
                  })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              onClick={() => handleRecordAttendance('present')}
              disabled={recordMutation.isPending || !scheduleDisplay.canClockIn}
              className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-50 disabled:shadow-none"
            >
              {recordMutation.isPending ? (
                t('attendance.recording')
              ) : (
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {t('officeAttendance.clockIn', { defaultValue: 'Clock In' })}
                </span>
              )}
            </Button>
            {!scheduleDisplay.isWorkingDay && (
              <p className="text-xs text-center text-neutral-500">
                {t('officeAttendance.cannotClockInNonWorkingDay', { defaultValue: 'You can only clock in on a working day.' })}
              </p>
            )}
            {scheduleDisplay.isAfterEnd && !scheduleDisplay.canClockIn ? (
              <p className="text-xs text-center text-amber-300">
                {t('officeAttendance.missedMessage', {
                  defaultValue: 'The configured office attendance window has ended without a clock-in record.',
                })}
              </p>
            ) : null}
          </div>
        )}

        {message && (
          <p className={`mt-4 text-sm font-medium text-center p-3 rounded-lg ${messageType === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {message}
          </p>
        )}

        {todayAttendances && todayAttendances.length > 0 && (
          <div className="mt-8 pt-5 border-t border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4">
              {t('officeAttendance.history', { defaultValue: 'Today\'s History' })}
            </h4>
            <div className="space-y-3">
              {todayAttendances.slice().reverse().map((att) => (
                <div key={att.id} className="flex justify-between items-center text-sm bg-neutral-900/50 p-3 rounded-md border border-neutral-800/50">
                  <span className="flex items-center gap-2 text-neutral-300">
                    <span className={`w-2 h-2 rounded-full ${att.status === 'present' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="capitalize font-medium">
                      {att.status === 'present' ? t('officeAttendance.in') : t('officeAttendance.out')}
                    </span>
                  </span>
                  <span className="text-neutral-400 font-mono tracking-wide">{format(new Date(att.recordedAt), 'HH:mm:ss')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
