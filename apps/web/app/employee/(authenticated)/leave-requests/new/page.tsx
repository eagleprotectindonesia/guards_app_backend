'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Calendar as CalendarIcon, 
  Send, 
  MessageSquare, 
  Paperclip, 
  X,
  Loader2,
  Info,
  Plus
} from 'lucide-react';
import { useCreateLeaveRequest } from '../../hooks/use-employee-queries';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { LeaveRequestReason } from '@repo/types';
import { uploadToS3 } from '@/lib/upload';
import toast from 'react-hot-toast';

const MAX_ATTACHMENTS = 4;

type LeaveMainCategory = 'sick' | 'family' | 'special' | 'annual';

type LeaveSubtypeOption = {
  reason: LeaveRequestReason;
  labelKey: string;
  fallbackLabel: string;
  descriptionKey: string;
  fallbackDescription: string;
};

const LEAVE_CATEGORY_OPTIONS: Record<LeaveMainCategory, LeaveSubtypeOption[]> = {
  sick: [
    {
      reason: 'sick',
      labelKey: 'leave.reasonType.sick',
      fallbackLabel: 'Sick Leave',
      descriptionKey: 'leave.reasonDescription.sick',
      fallbackDescription:
        'Sick leave without documentation will be converted to annual leave deduction during manager approval.',
    },
  ],
  family: [
    {
      reason: 'family_marriage',
      labelKey: 'leave.reasonType.family_marriage',
      fallbackLabel: 'Marriage Leave',
      descriptionKey: 'leave.reasonDescription.family_marriage',
      fallbackDescription: "3 days paid leave for employee's marriage.",
    },
    {
      reason: 'family_child_marriage',
      labelKey: 'leave.reasonType.family_child_marriage',
      fallbackLabel: 'Child Marriage',
      descriptionKey: 'leave.reasonDescription.family_child_marriage',
      fallbackDescription: "2 days paid leave for child's marriage.",
    },
    {
      reason: 'family_child_circumcision_baptism',
      labelKey: 'leave.reasonType.family_child_circumcision_baptism',
      fallbackLabel: 'Child Circumcision/Baptism',
      descriptionKey: 'leave.reasonDescription.family_child_circumcision_baptism',
      fallbackDescription: "2 days paid leave for child's ceremony.",
    },
    {
      reason: 'family_death',
      labelKey: 'leave.reasonType.family_death',
      fallbackLabel: 'Death of Family Member',
      descriptionKey: 'leave.reasonDescription.family_death',
      fallbackDescription: '2 days paid leave for death of immediate family (parent, in-law, or child).',
    },
    {
      reason: 'family_spouse_death',
      labelKey: 'leave.reasonType.family_spouse_death',
      fallbackLabel: 'Spouse Death',
      descriptionKey: 'leave.reasonDescription.family_spouse_death',
      fallbackDescription: '2 days paid leave from date of death and must be taken consecutively.',
    },
  ],
  special: [
    {
      reason: 'special_maternity',
      labelKey: 'leave.reasonType.special_maternity',
      fallbackLabel: 'Maternity Leave',
      descriptionKey: 'leave.reasonDescription.special_maternity',
      fallbackDescription: '3 months paid leave: 1.5 months before and 1.5 months after childbirth.',
    },
    {
      reason: 'special_miscarriage',
      labelKey: 'leave.reasonType.special_miscarriage',
      fallbackLabel: 'Miscarriage Leave',
      descriptionKey: 'leave.reasonDescription.special_miscarriage',
      fallbackDescription: '1.5 months paid leave for miscarriage recovery. Medical document required.',
    },
    {
      reason: 'special_paternity',
      labelKey: 'leave.reasonType.special_paternity',
      fallbackLabel: 'Paternity Leave',
      descriptionKey: 'leave.reasonDescription.special_paternity',
      fallbackDescription: '2 days paid leave for husband during childbirth or miscarriage of spouse.',
    },
    {
      reason: 'special_emergency',
      labelKey: 'leave.reasonType.special_emergency',
      fallbackLabel: 'Emergency Leave',
      descriptionKey: 'leave.reasonDescription.special_emergency',
      fallbackDescription: 'For urgent situations. Deducted from annual leave and requires HOD approval.',
    },
  ],
  annual: [
    {
      reason: 'annual',
      labelKey: 'leave.reasonType.annual',
      fallbackLabel: 'Annual Leave',
      descriptionKey: 'leave.reasonDescription.annual',
      fallbackDescription:
        '12 working days per year after 12 months of service. Leave balance is deducted by working days taken.',
    },
  ],
};

const FIXED_DURATION_DAYS_BY_REASON: Partial<Record<LeaveRequestReason, number>> = {
  family_marriage: 3,
  family_child_marriage: 2,
  family_child_circumcision_baptism: 2,
  family_death: 2,
  family_spouse_death: 2,
  special_paternity: 2,
  special_miscarriage: 45,
  special_maternity: 90,
};

export default function NewLeaveRequestPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const createMutation = useCreateLeaveRequest();

  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState<LeaveRequestReason>('annual');
  const [mainCategory, setMainCategory] = useState<LeaveMainCategory>('annual');
  const [employeeNote, setEmployeeNote] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const subtypeOptions = useMemo(() => LEAVE_CATEGORY_OPTIONS[mainCategory], [mainCategory]);
  const selectedSubtype = useMemo(
    () => subtypeOptions.find(option => option.reason === reason) ?? subtypeOptions[0],
    [reason, subtypeOptions]
  );
  
  const fixedDurationDays = FIXED_DURATION_DAYS_BY_REASON[reason];
  const isFixedDurationLeave = typeof fixedDurationDays === 'number';
  
  const computedEndDate = useMemo(() => {
    if (isFixedDurationLeave && fixedDurationDays) {
      return format(addDays(new Date(startDate), fixedDurationDays - 1), 'yyyy-MM-dd');
    }
    return endDate;
  }, [startDate, endDate, isFixedDurationLeave, fixedDurationDays]);

  const handleSelectMainCategory = (category: LeaveMainCategory) => {
    setMainCategory(category);
    const firstSubtype = LEAVE_CATEGORY_OPTIONS[category][0];
    if (firstSubtype) {
      setReason(firstSubtype.reason);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles].slice(0, MAX_ATTACHMENTS));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBefore(startOfDay(new Date(computedEndDate)), startOfDay(new Date(startDate)))) {
      toast.error(t('leave.validation.invalidRange', 'Invalid date range'));
      return;
    }

    try {
      setIsUploading(true);
      const attachmentKeys = await Promise.all(
        attachments.map(async (file) => {
          const uploaded = await uploadToS3(file, { folder: 'leave-requests' });
          return uploaded.key;
        })
      );

      await createMutation.mutateAsync({
        startDate,
        endDate: computedEndDate,
        reason,
        employeeNote: employeeNote.trim() || undefined,
        attachments: attachmentKeys,
      });

      toast.success(t('leave.success.created', 'Leave request created successfully'));
      router.push('/employee/leave-requests');
    } catch (error: unknown) {
      console.error('Error creating leave request:', error);
      const errorMessage = 
        error && typeof error === 'object' && 'error' in error ? (error.error as string) :
        error instanceof Error ? error.message :
        t('leave.error.createFailed', 'Failed to create leave request');
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-[#121212] flex flex-col relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-linear-to-b from-red-600/30 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-4 relative z-10">
        <button 
          type="button"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <h1 className="text-xl text-white font-bold">{t('leave.newRequest', 'New Leave Request')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-24 space-y-6 relative z-10">
        {/* Date Selection Card */}
        <div className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 shadow-xl space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
              {t('leave.startDate', 'Start Date')}
            </label>
            <div className="relative">
              <CalendarIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500" />
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full h-14 bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 text-white font-semibold focus:outline-hidden focus:border-red-500/50 transition-colors"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
              {t('leave.endDate', 'End Date')}
            </label>
            <div className="relative">
              <CalendarIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500" />
              <input 
                type="date"
                value={computedEndDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                disabled={isFixedDurationLeave}
                className="w-full h-14 bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 text-white font-semibold focus:outline-hidden focus:border-red-500/50 transition-colors disabled:opacity-50"
                required
              />
            </div>
            {isFixedDurationLeave && (
              <p className="text-[10px] text-neutral-500 italic ml-1">
                {t('leave.fixedDurationInfo', `Automatically set by policy (${fixedDurationDays} days).`)}
              </p>
            )}
          </div>
        </div>

        {/* Category Selection */}
        <div className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 shadow-xl space-y-4">
          <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
            {t('leave.category.title', 'Category')}
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LEAVE_CATEGORY_OPTIONS) as LeaveMainCategory[]).map(category => {
              const active = category === mainCategory;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleSelectMainCategory(category)}
                  className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                    active 
                      ? 'border-red-500/50 bg-red-500/20 text-white' 
                      : 'border-white/5 bg-white/5 text-neutral-400'
                  }`}
                >
                  {t(`leave.category.${category}`, category)}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
              {t('leave.subcategory.title', 'Leave Type')}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as LeaveRequestReason)}
              className="w-full h-14 bg-black/40 border border-white/5 rounded-2xl px-4 text-white font-semibold focus:outline-hidden focus:border-red-500/50 transition-colors appearance-none"
            >
              {subtypeOptions.map(option => (
                <option key={option.reason} value={option.reason} className="bg-[#1C1C1E]">
                  {t(option.labelKey, option.fallbackLabel)}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex gap-3">
            <Info size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                {t('leave.policyDescription', 'Policy')}
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {t(selectedSubtype.descriptionKey, selectedSubtype.fallbackDescription)}
              </p>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 shadow-xl space-y-2">
          <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
            {t('leave.note', 'Note')}
          </label>
          <div className="relative">
            <MessageSquare size={18} className="absolute left-4 top-4 text-neutral-600" />
            <textarea
              value={employeeNote}
              onChange={(e) => setEmployeeNote(e.target.value)}
              placeholder={t('leave.notePlaceholder', 'Add optional note')}
              className="w-full h-32 bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 pt-4 text-white text-sm focus:outline-hidden focus:border-red-500/50 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-neutral-900/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest ml-1">
              {t('leave.attachments', 'Attachments')}
            </label>
            <p className="text-[10px] text-neutral-600 font-bold">
              {attachments.length} / {MAX_ATTACHMENTS}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {attachments.map((file, index) => (
              <div key={index} className="relative bg-black/40 border border-white/5 rounded-xl p-3 flex items-center gap-2 group">
                <Paperclip size={14} className="text-neutral-500" />
                <span className="text-xs text-neutral-300 truncate flex-1">{file.name}</span>
                <button 
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="text-red-500 hover:scale-110 transition-transform"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            
            {attachments.length < MAX_ATTACHMENTS && (
              <label className="border-2 border-dashed border-white/5 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-colors">
                <Plus size={16} className="text-red-500" />
                <span className="text-xs font-bold text-red-500 uppercase tracking-widest">
                  {t('leave.addAttachment', 'Add')}
                </span>
                <input 
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  accept="image/*,application/pdf"
                />
              </label>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={createMutation.isPending || isUploading}
          className="w-full h-16 bg-linear-to-br from-[#FF3B30] to-[#A00000] rounded-2xl flex items-center justify-center gap-3 text-white font-bold uppercase tracking-widest shadow-xl shadow-red-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
        >
          {createMutation.isPending || isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Send size={20} />
              {t('leave.submit', 'Submit Request')}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="w-full text-center py-4 text-neutral-600 text-[10px] font-bold uppercase tracking-widest"
        >
          {t('common.cancel', 'Cancel')}
        </button>
      </form>
    </div>
  );
}
