'use client';

import { useState, useEffect, useMemo } from 'react';
import CheckInCard from '@/app/employee/components/shift/checkin-card';
import { AttendanceRecord } from '@/app/employee/components/attendance/attendance-record';
import { EmployeeCarousel } from '@/app/employee/components/shift/employee-carousel';
import { useProfile, useActiveShift } from './hooks/use-employee-queries';
import { useTranslation } from 'react-i18next';

export default function GuardPage() {
  const { t } = useTranslation();
  const { data: employeeDetails } = useProfile();
  const { data: shiftData, isLoading: loading, refetch: refetchShift } = useActiveShift();
  
  const activeShift = useMemo(() => shiftData?.activeShift || null, [shiftData]);
  const nextShifts = useMemo(() => shiftData?.nextShifts || [], [shiftData]);
  
  const [status, setStatus] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update current time every second to check window validity
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check if the current shift has ended
      if (activeShift) {
        const endTime = new Date(activeShift.endsAt.getTime() + 5 * 60000);
        if (now > endTime) {
          refetchShift();
        }
      } else if (nextShifts.length > 0) {
        // When there's no active shift, check if we've passed the scheduled start time of the next shift
        const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
        const startTime = new Date(nextShifts[0].startsAt);
        const shiftStartWithGrace = new Date(startTime.getTime() - FIVE_MINUTES_IN_MS);
        if (now >= shiftStartWithGrace) {
          refetchShift();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeShift, nextShifts, refetchShift]);

  useEffect(() => {
    const handleShiftUpdate = () => {
      refetchShift();
    };

    window.addEventListener('shift_updated', handleShiftUpdate);
    
    return () => {
      window.removeEventListener('shift_updated', handleShiftUpdate);
    };
  }, [refetchShift]);

  return (
    <div className="p-8 max-w-md mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-1">
        {t('dashboard.welcome')} <br /> {employeeDetails?.name || 'Guard'}!
      </h1>
      {employeeDetails?.employeeCode && (
        <p className="text-gray-500 text font-semibold mb-4">{t('dashboard.employeeCode')} {employeeDetails.employeeCode}</p>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">{t('dashboard.noActiveShift')}</p>
        </div>
      )}

      {(activeShift || nextShifts.length > 0) && (
        <>
          <EmployeeCarousel activeShift={activeShift} nextShifts={nextShifts} />

          {activeShift && (
            <>
              <AttendanceRecord
                shift={activeShift}
                onAttendanceRecorded={refetchShift}
                status={status}
                setStatus={setStatus}
                currentTime={currentTime}
              />
              {(() => {
                const ATTENDANCE_GRACE_MINS = 5;
                const startMs = new Date(activeShift.startsAt).getTime();
                const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;
                const isAttendanceLate = !activeShift.attendance && currentTime.getTime() > graceEndMs;

                return activeShift.attendance || isAttendanceLate ? (
                  <CheckInCard
                    activeShift={activeShift}
                    loading={loading}
                    status={status}
                    currentTime={currentTime}
                    setStatus={setStatus}
                    fetchShift={refetchShift}
                  />
                ) : null;
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}
