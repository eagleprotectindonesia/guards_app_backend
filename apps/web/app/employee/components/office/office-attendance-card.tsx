'use client';

import React, { useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  Clock,
  MapPin,
  CalendarDays,
  CheckCircle2,
  LogOut,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  useRecordOfficeAttendance,
  useOfficeAttendance,
  useWeeklyOfficeAttendance,
} from '@/app/employee/(authenticated)/hooks/use-employee-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getOfficeScheduleDisplayState,
  getOfficeHolidayDisplayContent,
  resolveOfficeAttendanceErrorMessage,
} from './office-attendance-card-utils';
import { OfficeAttendanceCarousel } from './office-attendance-carousel';
import { optimizeImage } from '@/lib/image-utils';
import { uploadToS3 } from '@/lib/upload';
import { getEmployeeAttendanceCheckinErrorPayload } from '@repo/shared';

interface OfficeAttendanceCardProps {
  office?: { id: string; name: string } | null;
}

const ATTENDANCE_PHOTO_MAX_DIMENSION = 1280;
const TEMP_DISABLE_ATTENDANCE_PHOTO = true;

export function OfficeAttendanceCard({ office }: OfficeAttendanceCardProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);
  const requirePhotoForClockIn = !TEMP_DISABLE_ATTENDANCE_PHOTO;

  const { data, refetch, isRefetching } = useOfficeAttendance();
  const { data: weeklyData, isLoading: isWeeklyLoading } = useWeeklyOfficeAttendance();
  const recordMutation = useRecordOfficeAttendance();

  const attendances = data?.attendances ?? [];
  const historyAttendances = (data?.displayAttendances ?? attendances).filter(
    attendance => attendance.status === 'present' || attendance.status === 'clocked_out' || attendance.status === 'absent'
  );
  const scheduleContext = data?.scheduleContext;
  const attendanceState = data?.attendanceState;
  const scheduleDisplay = getOfficeScheduleDisplayState(scheduleContext, attendanceState);
  const holidayDisplay = getOfficeHolidayDisplayContent(t, scheduleDisplay.holidayPolicy);

  const latestAttendance = scheduleDisplay.latestAttendance ?? attendances[0];
  const resolvedOffice = office ?? latestAttendance?.office ?? null;
  const isClockedIn = scheduleDisplay.isClockedIn;
  const hasClockedOut = scheduleDisplay.isCompleted;
  const hasAssignedOffice = Boolean(resolvedOffice?.id);

  const requestLocation = async () => {
    if (!navigator.geolocation) {
      if (hasAssignedOffice) {
        toast.error(t('attendance.locationErrorTitle'), { id: 'location-error' });
      }
      return null;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
    } catch {
      if (hasAssignedOffice) {
        toast.error(t('officeAttendance.errors.locationRequired'), { id: 'location-error' });
      }
      return null;
    }
  };

  const handleCapturePhoto = (): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = fileInputRef.current;
      if (!input) return resolve(null);

      const handleCapture = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        setStatusMessage(t('officeAttendance.optimizingPhoto', 'Optimizing attendance photo'));
        try {
          const optimized = await optimizeImage(file, ATTENDANCE_PHOTO_MAX_DIMENSION);
          resolve(optimized);
        } catch (error) {
          console.error('Error optimizing image:', error);
          toast.error(t('officeAttendance.errors.photoOptimizationFailed', 'Failed to optimize photo'));
          resolve(null);
        } finally {
          input.value = '';
          input.removeEventListener('change', handleCapture);
        }
      };

      input.addEventListener('change', handleCapture);
      input.click();
    });
  };

  const handleRecordAttendance = async (nextStatus: 'present' | 'clocked_out') => {
    setStatusMessage(nextStatus === 'present' ? t('attendance.gettingLocation') : t('common.processing'));

    const location = await requestLocation();
    if (hasAssignedOffice && !location) {
      setStatusMessage(t('officeAttendance.errors.locationRequired'));
      return;
    }

    try {
      let photoKey: string | undefined = undefined;
      let photoMetadata: {
        pictureOptimized: {
          fileSize: number;
          contentType: string;
        };
      } | undefined = undefined;

      if (nextStatus === 'present' && requirePhotoForClockIn) {
        setIsPhotoProcessing(true);
        setStatusMessage(t('officeAttendance.takingPhoto', 'Taking attendance photo'));
        
        const photoFile = await handleCapturePhoto();
        if (!photoFile) {
          setIsPhotoProcessing(false);
          setStatusMessage('');
          return;
        }

        setStatusMessage(t('officeAttendance.uploadingPhoto', 'Uploading attendance photo'));
        const upload = await uploadToS3(photoFile, {
          folder: 'office-attendance',
          fileType: 'image',
        });
        
        photoKey = upload.key;
        photoMetadata = {
          pictureOptimized: {
            fileSize: upload.size,
            contentType: upload.contentType,
          },
        };
      }

      setStatusMessage(nextStatus === 'present' ? t('attendance.recording') : t('common.processing'));

      await recordMutation.mutateAsync({
        location: location ?? undefined,
        metadata: photoMetadata,
        picture: photoKey,
        status: nextStatus,
      });

      const successMessage = nextStatus === 'present' ? t('attendance.success') : t('officeAttendance.clockOutSuccess');

      setStatusMessage(successMessage);
      toast.success(successMessage, { id: 'attendance-success' });
      refetch();
    } catch (error: unknown) {
      const errorData = getEmployeeAttendanceCheckinErrorPayload(error);
      if (nextStatus === 'present' && errorData.code === 'photo_required' && !requirePhotoForClockIn) {
        setIsPhotoProcessing(true);
        setStatusMessage(t('officeAttendance.takingPhoto', 'Taking attendance photo'));
        try {
          const photoFile = await handleCapturePhoto();
          if (!photoFile) {
            setStatusMessage('');
            return;
          }

          setStatusMessage(t('officeAttendance.uploadingPhoto', 'Uploading attendance photo'));
          const upload = await uploadToS3(photoFile, {
            folder: 'office-attendance',
            fileType: 'image',
          });

          setStatusMessage(t('attendance.recording'));
          await recordMutation.mutateAsync({
            location: location ?? undefined,
            metadata: {
              pictureOptimized: {
                fileSize: upload.size,
                contentType: upload.contentType,
              },
            },
            picture: upload.key,
            status: nextStatus,
          });

          const successMessage = t('attendance.success');
          setStatusMessage(successMessage);
          toast.success(successMessage, { id: 'attendance-success' });
          refetch();
          return;
        } catch (retryError: unknown) {
          const retryErrorData = getEmployeeAttendanceCheckinErrorPayload(retryError);
          const retryMessage = resolveOfficeAttendanceErrorMessage(t, {
            code: retryErrorData.code,
            fallbackMessage:
              retryErrorData.error ||
              retryErrorData.message ||
              (retryError instanceof Error ? retryError.message : undefined),
            details: retryErrorData.details,
          });

          setStatusMessage(retryMessage);
          toast.error(retryMessage, { id: 'attendance-error' });
          return;
        } finally {
          setIsPhotoProcessing(false);
        }
      }

      const message = resolveOfficeAttendanceErrorMessage(t, {
        code: errorData.code,
        fallbackMessage: errorData.error || errorData.message || (error instanceof Error ? error.message : undefined),
        details: errorData.details,
      });

      setStatusMessage(message);
      toast.error(message, { id: 'attendance-error' });
    } finally {
      setIsPhotoProcessing(false);
    }
  };

  const handleClockOutPress = () => {
    if (window.confirm(t('officeAttendance.clockOutConfirmMessage'))) {
      void handleRecordAttendance('clocked_out');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-[10px] text-neutral-500 uppercase tracking-[1.5px] font-bold px-1">
          {t('officeAttendance.weeklyHistory', 'Weekly History')}
        </h4>
        <OfficeAttendanceCarousel
          weeklyDays={weeklyData?.days || []}
          isLoading={isWeeklyLoading}
        />
      </div>

      <Card className="rounded-[28px] overflow-hidden bg-[#0F0F0F] border-white/10 shadow-xl relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-blue-600/10 to-transparent" />
        </div>

        <div className="p-6 border-b border-white/5 relative z-10">
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-4 space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold text-white">
                  {t('officeAttendance.title')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-sm text-neutral-400">
                  {resolvedOffice?.name || t('officeAttendance.noOfficeAssigned')}
                </span>
              </div>
            </div>

            {scheduleDisplay.isWorkingDay && (
              <div className="bg-blue-500/15 text-blue-300 border border-blue-400/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[1px]">
                {t('officeAttendance.workingDay')}
              </div>
            )}
          </div>
        </div>

        <CardContent className="p-6 space-y-5 relative z-10">
          {scheduleContext && scheduleDisplay.isWorkingDay ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4 text-blue-400" />
                <span className="text-white font-semibold">
                  {scheduleDisplay.scheduleName || t('officeAttendance.title')}
                </span>
              </div>

              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-neutral-500">{t('officeAttendance.dateLabel')}</span>
                <span className="text-sm text-white">{scheduleDisplay.businessDate || '-'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-500">{t('officeAttendance.windowLabel')}</span>
                <span className="text-sm text-emerald-400 font-semibold font-mono">
                  {scheduleDisplay.scheduledStartStr || '--:--'} - {scheduleDisplay.scheduledEndStr || '--:--'}
                </span>
              </div>
            </div>
          ) : scheduleContext ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <p className="text-neutral-400">{t('officeAttendance.nonWorkingDay')}</p>
            </div>
          ) : null}

          {holidayDisplay && (
            <div
              className={`rounded-2xl p-4 border space-y-2 ${
                scheduleDisplay.holidayPolicy?.entry?.type === 'emergency'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : scheduleDisplay.holidayPolicy?.entry?.type === 'special_working_day'
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-neutral-400 uppercase tracking-[1.2px] font-bold">
                  {holidayDisplay.headline}
                </span>
                <span className="text-[10px] text-neutral-400">
                  {holidayDisplay.typeLabel}
                </span>
              </div>
              <p className="text-white font-semibold">{holidayDisplay.title}</p>
              <p
                className={`text-sm ${
                  scheduleDisplay.holidayPolicy?.entry?.type === 'emergency'
                    ? 'text-amber-200'
                    : scheduleDisplay.holidayPolicy?.entry?.type === 'special_working_day'
                      ? 'text-blue-200'
                      : 'text-emerald-200'
                }`}
              >
                {holidayDisplay.impact}
              </p>
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm text-neutral-400">{t('officeAttendance.dateLabel')}</span>
                <span className="text-sm text-white">{scheduleDisplay.businessDate || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">{t('officeAttendance.holiday.compensation')}</span>
                <span className="text-sm text-white">{holidayDisplay.paidStatus}</span>
              </div>
            </div>
          )}

          {isClockedIn ? (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <div>
                  <p className="text-sm text-neutral-400">{t('officeAttendance.clockedIn')}</p>
                  <p className="text-2xl text-emerald-300 font-bold font-mono">
                    {latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm:ss') : '--:--:--'}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleClockOutPress}
                disabled={recordMutation.isPending || isPhotoProcessing}
                className="w-full h-14 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-800 hover:from-rose-500 hover:to-rose-700 text-white font-bold uppercase tracking-[1px] shadow-lg shadow-rose-900/20 transition-all active:scale-[0.985]"
              >
                {recordMutation.isPending || isPhotoProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    <LogOut className="w-5 h-5" />
                    {t('officeAttendance.clockOut')}
                  </div>
                )}
              </Button>
            </div>
          ) : hasClockedOut ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-neutral-500" />
              <div>
                <p className="text-sm text-neutral-400">{t('officeAttendance.dayCompleted')}</p>
                <p className="text-sm text-neutral-500">
                  {t('officeAttendance.clockOutTime')}{' '}
                  {latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm') : '--:--'}
                </p>
              </div>
            </div>
          ) : scheduleDisplay.isMissed ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <div className="flex-1">
                <p className="text-sm text-amber-300 font-semibold">{t('officeAttendance.missedTitle')}</p>
                <p className="text-sm text-amber-100">{t('officeAttendance.missedMessage')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={scheduleDisplay.canClockIn ? () => handleRecordAttendance('present') : undefined}
                disabled={!scheduleDisplay.canClockIn || recordMutation.isPending || isPhotoProcessing}
                className={`w-full h-14 rounded-2xl font-bold uppercase tracking-[1px] shadow-lg transition-all active:scale-[0.985] ${
                  scheduleDisplay.canClockIn
                    ? 'bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white shadow-blue-900/20'
                    : 'bg-gradient-to-br from-neutral-700 to-neutral-800 text-neutral-400 shadow-none cursor-not-allowed'
                }`}
              >
                {recordMutation.isPending || isPhotoProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {t('officeAttendance.clockIn')}
                  </div>
                )}
              </Button>

              {!scheduleDisplay.isWorkingDay && (
                <p className="text-sm text-neutral-500 text-center">
                  {t('officeAttendance.cannotClockInNonWorkingDay')}
                </p>
              )}
              {scheduleDisplay.isAfterEnd && !scheduleDisplay.canClockIn && (
                <p className="text-sm text-amber-300 text-center">
                  {t('officeAttendance.missedMessage')}
                </p>
              )}
            </div>
          )}

          {statusMessage && (
            <p className="text-sm text-blue-400 text-center animate-pulse">
              {statusMessage}
            </p>
          )}

          {isRefetching && (
            <p className="text-[10px] text-neutral-500 text-center">
              {t('common.loading')}...
            </p>
          )}

          {historyAttendances.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/10 space-y-4">
              <h4 className="text-[10px] text-neutral-500 uppercase tracking-[1.5px] font-bold">
                {t('officeAttendance.history')}
              </h4>

              <div className="space-y-2">
                {historyAttendances
                  .slice()
                  .reverse()
                  .map(attendance => (
                    <div
                      key={attendance.id}
                      className="flex justify-between items-center bg-white/5 border border-white/5 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            attendance.status === 'present'
                              ? 'bg-emerald-500'
                              : attendance.status === 'absent'
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-sm text-white">
                          {attendance.status === 'present'
                            ? t('officeAttendance.in')
                            : attendance.status === 'absent'
                              ? t('officeAttendance.absent')
                              : t('officeAttendance.out')}
                        </span>
                      </div>

                      <span className="text-sm text-neutral-400 font-medium font-mono">
                        {attendance.status === 'absent' ? '-' : format(new Date(attendance.recordedAt), 'HH:mm:ss')}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="user"
        className="hidden"
      />
    </div>
  );
}
