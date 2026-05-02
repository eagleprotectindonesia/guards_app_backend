'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Bell, 
  CalendarDays,
  Loader2
} from 'lucide-react';
import { useAnnouncements } from '../hooks/use-employee-queries';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { announcements, unreadCount, isLoading, markCurrentAsSeen } = useAnnouncements();

  const dateLocale = i18n.language === 'id' ? id : enUS;

  useEffect(() => {
    if (unreadCount > 0) {
      markCurrentAsSeen();
    }
  }, [markCurrentAsSeen, unreadCount]);

  return (
    <div className="flex-1 min-h-screen bg-[#121212] flex flex-col relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-linear-to-b from-orange-600/30 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-4 relative z-10">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <h1 className="text-xl text-white font-bold">{t('announcements.title', 'Announcements')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-4 relative z-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-neutral-500 text-sm">{t('common.loading', 'Loading...')}</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/5">
              <Bell size={40} className="text-neutral-700" />
            </div>
            <p className="text-neutral-500 font-medium">
              {t('announcements.empty', 'No announcements yet.')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((item) => (
              <div 
                key={item.id}
                className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl space-y-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">
                    {item.kind === 'holiday'
                      ? t('announcements.kindHoliday', 'Holiday')
                      : t('announcements.kindOfficeMemo', 'Office Memo')}
                  </span>
                  <div className="flex items-center gap-1 text-neutral-500">
                    <CalendarDays size={12} />
                    <span className="text-[10px] font-medium">
                      {format(new Date(item.startsAt), 'dd MMM yyyy', { locale: dateLocale })}
                    </span>
                  </div>
                </div>

                <h3 className="text-white font-bold leading-tight">
                  {item.title}
                </h3>

                <p className="text-neutral-300 text-sm leading-relaxed">
                  {item.message?.trim() ||
                    (item.kind === 'holiday'
                      ? t('announcements.holidaySummary', 'Upcoming holiday. Check attendance policy for this date.')
                      : t('announcements.officeMemoSummary', 'Office memo update. Please review the details.'))}
                </p>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                    {t('announcements.period', 'Period')}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">
                    {format(new Date(item.startsAt), 'dd MMM', { locale: dateLocale })} -{' '}
                    {format(new Date(item.endsAt), 'dd MMM yyyy', { locale: dateLocale })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
