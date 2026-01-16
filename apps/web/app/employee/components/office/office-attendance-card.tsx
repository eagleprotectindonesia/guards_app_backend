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
import { CheckCircle2, Clock, LogOut } from 'lucide-react';

interface OfficeAttendanceCardProps {
  office: { id: string; name: string };
  onAttendanceRecorded?: () => void;
}

export function OfficeAttendanceCard({ office, onAttendanceRecorded }: OfficeAttendanceCardProps) {
  const { t } = useTranslation();
  const { data: todayAttendances, refetch: refetchAttendance } = useOfficeAttendance();
  const recordMutation = useRecordOfficeAttendance();
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const lastAttendance = todayAttendances?.[0];
  const isClockedIn = lastAttendance && lastAttendance.status !== 'clocked_out';

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
        officeId: office.id,
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
    <Card className="mb-4 shadow-sm bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl flex items-center gap-2">
          <Clock className="w-6 h-6 text-primary" />
          {t('officeAttendance.title')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{office.name}</p>
      </CardHeader>
      <CardContent>
        {isClockedIn ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              {t('officeAttendance.clockedIn', { time: format(new Date(lastAttendance.recordedAt), 'HH:mm') })}
            </div>

            <Button
              variant="outline"
              onClick={() => handleRecordAttendance('clocked_out')}
              disabled={recordMutation.isPending}
              className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {recordMutation.isPending ? (
                t('common.loading')
              ) : (
                <span className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  {t('officeAttendance.clockOut')}
                </span>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground">{t('officeAttendance.notRecorded')}</p>
            <Button
              onClick={() => handleRecordAttendance('present')}
              disabled={recordMutation.isPending}
              className="w-full"
            >
              {recordMutation.isPending ? (
                t('attendance.recording')
              ) : (
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t('officeAttendance.clockIn')}
                </span>
              )}
            </Button>
          </div>
        )}

        {message && (
          <p className={`mt-4 text-sm font-medium ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}

        {todayAttendances && todayAttendances.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {t('officeAttendance.history')}
            </h4>
            <div className="space-y-2">
              {todayAttendances.slice(0, 3).map(att => (
                <div key={att.id} className="flex justify-between text-sm">
                  <span className="capitalize">
                    {att.status === 'present' ? t('officeAttendance.in') : t('officeAttendance.out')}
                  </span>
                  <span className="text-muted-foreground">{format(new Date(att.recordedAt), 'HH:mm')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
