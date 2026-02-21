'use client';

import { useState, useEffect, useMemo } from 'react';
import CheckInCard from '@/app/employee/components/shift/checkin-card';
import { AttendanceRecord } from '@/app/employee/components/attendance/attendance-record';
import { EmployeeCarousel } from '@/app/employee/components/shift/employee-carousel';
import { OfficeAttendanceCard } from '@/app/employee/components/office/office-attendance-card';
import { useProfile, useActiveShift } from './hooks/use-employee-queries';
import { useTranslation } from 'react-i18next';

export default function EmployeePage() {
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

  const isOfficeEmployee = employeeDetails?.role === 'office';

  const defaultAvatar =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDzcxM7B2Plj0M6rLwD5-jwCeXCJ-VxTGp8XT8dffCo7Cjv4BQ3_fM-MkOicyMU8jJxMw9Q81kjfqVm_zD_yfF92pmxUsZDY_fB7by9N3_LAOMNfdJlNjEUudjhqq7Cm5LUPTk9aKNVSgT9A4rsOYqHKU5vKRmjMZknp_AFtbKxzLh1PX2V_AKy5bez2tThvg_swnSuuvc4uRhd_JO8vfyGxuCUlrrS_Gt_LXaPHMHfgxPWTz6nvJqDPVw3QneYlTqVGg46xTuvrQDq';

  return (
    <div className="p-6 max-w-md mx-auto font-sans">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full border border-white/10 overflow-hidden bg-neutral-900 shadow-lg">
          <img src={defaultAvatar} alt="Profile" className="w-full h-full object-cover opacity-90" />
        </div>
        <div className="flex flex-col">
          <span className="text-red-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5">
            {employeeDetails?.jobTitle || t('dashboard.unit', { defaultValue: 'Security Unit' })}
          </span>
          <h1 className="text-2xl font-bold text-white leading-tight">{employeeDetails?.fullName || 'Employee'}</h1>
        </div>
      </div>

      {loading && <p>{t('common.loading')}</p>}

      {isOfficeEmployee ? (
        employeeDetails?.office ? (
          <OfficeAttendanceCard office={employeeDetails.office} />
        ) : (
          <div className="text-center p-8 border-2 border-dashed rounded bg-yellow-50 border-yellow-200">
            <p className="text-yellow-700">Anda belum ditugaskan ke kantor mana pun. Silakan hubungi admin.</p>
          </div>
        )
      ) : (
        <>
          {!loading && !activeShift && (
            <div className="text-center p-8 border-2 border-dashed border-neutral-800 rounded bg-[#0F0F0F]">
              <p className="text-neutral-500">{t('dashboard.noActiveShift')}</p>
            </div>
          )}

          {(activeShift || nextShifts.length > 0) && (
            <>
              <EmployeeCarousel activeShift={activeShift} nextShifts={nextShifts} />
              {activeShift && (
                <>
                  {activeShift.attendance && (
                    <CheckInCard
                      activeShift={activeShift}
                      loading={loading}
                      status={status}
                      currentTime={currentTime}
                      setStatus={setStatus}
                      fetchShift={refetchShift}
                    />
                  )}
                  <AttendanceRecord
                    shift={activeShift}
                    onAttendanceRecorded={refetchShift}
                    status={status}
                    setStatus={setStatus}
                    currentTime={currentTime}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
