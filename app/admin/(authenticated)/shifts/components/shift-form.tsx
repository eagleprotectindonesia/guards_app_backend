'use client';

import { Serialized } from '@/lib/utils';
import { createShift, updateShift, ActionState } from '../actions';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Shift, Site, ShiftType, Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from '../../components/select';
import { useRouter } from 'next/navigation';

type Props = {
  shift?: Serialized<Shift>;
  sites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  guards: Serialized<Guard>[];
};

export default function ShiftForm({ shift, sites, shiftTypes, guards }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shift ? updateShift.bind(null, shift.id) : createShift,
    { success: false }
  );

  const [date, setDate] = useState<Date | null>(shift?.date ? new Date(shift.date) : new Date());
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>(shift?.shiftTypeId || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(shift?.siteId || '');
  const [selectedGuardId, setSelectedGuardId] = useState<string>(shift?.guardId || '');

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shift ? 'Shift updated successfully!' : 'Shift created successfully!'));
      router.push('/admin/shifts');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, shift, router]);

  const siteOptions = sites.map(site => ({ value: site.id, label: site.name }));
  const guardOptions = guards.map(guard => ({ value: guard.id, label: guard.name })).slice(0, 8);
  const shiftTypeOptions = shiftTypes.map(st => ({
    value: st.id,
    label: `${st.name} (${st.startTime} - ${st.endTime})`,
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{shift ? 'Edit Shift' : 'Schedule New Shift'}</h1>
      <form action={formAction} className="space-y-6">
        {/* Site Field */}
        <div>
          <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 mb-1">
            Site
          </label>
          <Select
            id="site-select"
            instanceId="site-select"
            options={siteOptions}
            value={siteOptions.find(opt => opt.value === selectedSiteId) || null}
            onChange={option => setSelectedSiteId(option?.value || '')}
            placeholder="Select a site..."
            isClearable
          />
          <input type="hidden" name="siteId" value={selectedSiteId} />
          {state.errors?.siteId && <p className="text-red-500 text-xs mt-1">{state.errors.siteId[0]}</p>}
        </div>

        {/* Shift Type Field */}
        <div>
          <label htmlFor="shiftTypeId" className="block text-sm font-medium text-gray-700 mb-1">
            Shift Type
          </label>
          <Select
            id="shift-type-select"
            instanceId="shift-type-select"
            options={shiftTypeOptions}
            value={shiftTypeOptions.find(opt => opt.value === selectedShiftTypeId) || null}
            onChange={option => setSelectedShiftTypeId(option?.value || '')}
            placeholder="Select a shift type"
            isClearable={false}
            isSearchable={false}
          />
          <input type="hidden" name="shiftTypeId" value={selectedShiftTypeId} />
          {state.errors?.shiftTypeId && <p className="text-red-500 text-xs mt-1">{state.errors.shiftTypeId[0]}</p>}
        </div>

        {/* Guard Field */}
        <div>
          <label htmlFor="guardId" className="block text-sm font-medium text-gray-700 mb-1">
            Guard
          </label>
          <Select
            id="guard-select"
            instanceId="guard-select"
            options={guardOptions}
            value={guardOptions.find(opt => opt.value === selectedGuardId) || null}
            onChange={option => setSelectedGuardId(option?.value || '')}
            placeholder="Unassigned"
            isClearable
          />
          <input type="hidden" name="guardId" value={selectedGuardId} />
        </div>

        {/* Date Field */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
            Date
          </label>
          {/* Hidden input for formatted date string YYYY-MM-DD */}
          <input type="hidden" name="date" value={date ? date.toISOString().split('T')[0] : ''} />
          <DatePicker
            selected={date}
            onChange={d => setDate(d)}
            dateFormat="yyyy-MM-dd"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            wrapperClassName="w-full"
          />
          {state.errors?.date && <p className="text-red-500 text-xs mt-1">{state.errors.date[0]}</p>}
        </div>

        {/* Config Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="requiredCheckinIntervalMins" className="block text-sm font-medium text-gray-700 mb-1">
              Interval (min)
            </label>
            <input
              type="number"
              name="requiredCheckinIntervalMins"
              id="requiredCheckinIntervalMins"
              defaultValue={shift?.requiredCheckinIntervalMins || 20}
              min={5}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
            {state.errors?.requiredCheckinIntervalMins && (
              <p className="text-red-500 text-xs mt-1">{state.errors.requiredCheckinIntervalMins[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="graceMinutes" className="block text-sm font-medium text-gray-700 mb-1">
              Grace Period (min)
            </label>
            <input
              type="number"
              name="graceMinutes"
              id="graceMinutes"
              defaultValue={shift?.graceMinutes || 2}
              min={1}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
            {state.errors?.graceMinutes && <p className="text-red-500 text-xs mt-1">{state.errors.graceMinutes[0]}</p>}
          </div>
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => router.push('/admin/shifts')}
            className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : shift ? 'Save Changes' : 'Schedule Shift'}
          </button>
        </div>
      </form>
    </div>
  );
}
