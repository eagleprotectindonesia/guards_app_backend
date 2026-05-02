'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ChevronLeft, 
  Plus, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Loader2
} from 'lucide-react';
import { useMyLeaveRequests, useCancelLeaveRequest } from '../hooks/use-employee-queries';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { LeaveRequestReason, LeaveRequestStatus } from '@repo/types';
import toast from 'react-hot-toast';

export default function LeaveRequestsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useMyLeaveRequests();
  const cancelMutation = useCancelLeaveRequest();

  const requests = data?.leaveRequests ?? [];
  const annualLeaveBalance = data?.annualLeaveBalance;

  const dateLocale = i18n.language === 'id' ? id : enUS;

  const getStatusConfig = (status: LeaveRequestStatus) => {
    switch (status) {
      case 'approved':
        return {
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-500/10',
          icon: CheckCircle2,
          label: t('leave.status.approved'),
        };
      case 'rejected':
        return {
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          icon: XCircle,
          label: t('leave.status.rejected'),
        };
      case 'cancelled':
        return {
          color: 'text-neutral-500',
          bgColor: 'bg-neutral-500/10',
          icon: Clock,
          label: t('leave.status.cancelled'),
        };
      case 'pending':
      case 'pending_hr':
      case 'pending_manager':
      default:
        return {
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          icon: AlertCircle,
          label: t('leave.status.pending'),
        };
    }
  };

  const getReasonLabel = (reason: LeaveRequestReason) => {
    const reasonLabels: Record<LeaveRequestReason, string> = {
      sick: t('leave.reasonType.sick', 'Sick Leave'),
      family_marriage: t('leave.reasonType.family_marriage', 'Marriage Leave'),
      family_child_marriage: t('leave.reasonType.family_child_marriage', 'Child Marriage'),
      family_child_circumcision_baptism: t(
        'leave.reasonType.family_child_circumcision_baptism',
        'Child Circumcision/Baptism'
      ),
      family_death: t('leave.reasonType.family_death', 'Death of Family Member'),
      family_spouse_death: t('leave.reasonType.family_spouse_death', 'Spouse Death'),
      special_maternity: t('leave.reasonType.special_maternity', 'Maternity Leave'),
      special_miscarriage: t('leave.reasonType.special_miscarriage', 'Miscarriage Leave'),
      special_paternity: t('leave.reasonType.special_paternity', 'Paternity Leave'),
      special_emergency: t('leave.reasonType.special_emergency', 'Emergency Leave'),
      annual: t('leave.reasonType.annual', 'Annual Leave'),
    };
    return reasonLabels[reason] ?? reason;
  };

  const handleCancel = async (id: string) => {
    if (!confirm(t('leave.cancelConfirmMessage', 'Are you sure you want to cancel this leave request?'))) return;

    try {
      await cancelMutation.mutateAsync(id);
      toast.success(t('leave.success.cancelled', 'Leave request cancelled successfully'));
    } catch {
      toast.error(t('leave.error.cancelFailed', 'Failed to cancel leave request'));
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-[#121212] flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-linear-to-b from-red-600/30 to-transparent blur-3xl" />
      </div>

      <div className="px-6 py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10"
          >
            <ChevronLeft size={24} className="text-white" />
          </button>
          <h1 className="text-xl text-white font-bold">{t('leave.title', 'Leave Requests')}</h1>
        </div>
        
        <Link 
          href="/employee/leave-requests/new"
          className="w-10 h-10 rounded-full bg-linear-to-br from-[#FF3B30] to-[#A00000] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Plus size={24} className="text-white" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-4 relative z-10">
        {annualLeaveBalance && (
          <div className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-3xl p-4 shadow-xl">
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-2">
              {t('leave.reasonType.annual')} {annualLeaveBalance.year}
            </p>
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">
                  {t('leave.balanceAvailable')}
                </p>
                <p className="text-3xl text-white font-bold">{annualLeaveBalance.availableDays}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">
                  {t('leave.balanceUsed')}
                </p>
                <p className="text-sm text-neutral-400 font-semibold">
                  {annualLeaveBalance.consumedDays} / {annualLeaveBalance.entitledDays}
                </p>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <p className="text-neutral-500 text-sm">{t('common.loading')}</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/5">
              <Calendar size={40} className="text-neutral-700" />
            </div>
            <p className="text-neutral-500 font-medium mb-8">
              {t('leave.noRequests')}
            </p>
            <Link 
              href="/employee/leave-requests/new"
              className="w-full h-12 bg-[#FF3B30] rounded-xl flex items-center justify-center text-white font-bold"
            >
              {t('leave.requestLeave')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const config = getStatusConfig(request.status);
              const StatusIcon = config.icon;
              
              return (
                <div 
                  key={request.id}
                  className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 shadow-xl space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} className="text-neutral-500" />
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                          {t('leave.startDate')}
                        </span>
                      </div>
                      <p className="text-white font-bold">
                        {format(new Date(request.startDate), 'dd MMM yyyy', { locale: dateLocale })}
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                          {t('leave.endDate')}
                        </span>
                        <Calendar size={12} className="text-neutral-500" />
                      </div>
                      <p className="text-white font-bold">
                        {format(new Date(request.endDate), 'dd MMM yyyy', { locale: dateLocale })}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-white/5 w-full" />

                  <div className="space-y-1">
                    <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                      {t('leave.reason')}
                    </p>
                    <p className="text-neutral-300 font-medium text-sm">
                      {getReasonLabel(request.reason)}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/5 ${config.bgColor}`}>
                      <StatusIcon size={14} className={config.color} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                        {config.label}
                      </span>
                    </div>

                    {['pending', 'pending_hr', 'pending_manager'].includes(request.status) && (
                      <button
                        onClick={() => handleCancel(request.id)}
                        className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-red-500 text-[10px] font-bold uppercase tracking-wider"
                      >
                        {t('leave.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
