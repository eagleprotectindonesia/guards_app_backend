'use client';

import { Serialized } from '@/lib/utils';
import Modal from '../../components/modal';
import { createShift, updateShift, ActionState } from '../actions';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Shift, Site, ShiftType, Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type Props = {
  shift?: Serialized<Shift>;
  sites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  guards: Serialized<Guard>[];
  isOpen: boolean;
  onClose: () => void;
};

export default function ShiftFormDialog({ shift, sites, shiftTypes, guards, isOpen, onClose }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shift ? updateShift.bind(null, shift.id) : createShift,
    { success: false }
  );

  const [date, setDate] = useState<Date | null>(shift?.date ? new Date(shift.date) : new Date());
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>(shift?.shiftTypeId || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(shift?.siteId || ''); // Still need to track selected site

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shift ? 'Shift updated successfully!' : 'Shift created successfully!'));
      onClose();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, onClose, shift]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={shift ? 'Edit Shift' : 'Schedule New Shift'}>
      <form action={formAction} className="space-y-4 p-4">
        {/* Site Field */}
        <div>
          <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 mb-1">
            Site
          </label>
          <select
            name="siteId"
            id="siteId"
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white"
          >
            <option value="" disabled>
              Select a site
            </option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          {state.errors?.siteId && <p className="text-red-500 text-xs mt-1">{state.errors.siteId[0]}</p>}
        </div>

        {/* Shift Type Field */}
        <div>
          <label htmlFor="shiftTypeId" className="block text-sm font-medium text-gray-700 mb-1">
            Shift Type
          </label>
          <select
            name="shiftTypeId"
            id="shiftTypeId"
            value={selectedShiftTypeId}
            onChange={e => setSelectedShiftTypeId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white"
          >
            <option value="" disabled>
              Select a shift type
            </option>
            {shiftTypes.map(st => (
              <option key={st.id} value={st.id}>
                {st.name} ({st.startTime} - {st.endTime})
              </option>
            ))}
          </select>
          {state.errors?.shiftTypeId && <p className="text-red-500 text-xs mt-1">{state.errors.shiftTypeId[0]}</p>}
        </div>

        {/* Guard Field */}
        <div>
          <label htmlFor="guardId" className="block text-sm font-medium text-gray-700 mb-1">
            Guard (Optional)
          </label>
          <select
            name="guardId"
            id="guardId"
            defaultValue={shift?.guardId || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white"
          >
            <option value="">Unassigned</option>
            {guards.map(guard => (
              <option key={guard.id} value={guard.id}>
                {guard.name}
              </option>
            ))}
          </select>
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
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : shift ? 'Save Changes' : 'Schedule Shift'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
