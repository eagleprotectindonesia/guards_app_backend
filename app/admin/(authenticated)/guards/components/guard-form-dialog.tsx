'use client';

import { Serialized } from '@/lib/utils';
import Modal from '../../components/modal';
import { createGuard, updateGuard, ActionState } from '../actions';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';

type Props = {
  guard?: Serialized<Guard>; // If provided, it's an edit form
  isOpen: boolean;
  onClose: () => void;
};

export default function GuardFormDialog({ guard, isOpen, onClose }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    guard ? updateGuard.bind(null, guard.id) : createGuard,
    { success: false }
  );

  const [joinDate, setJoinDate] = useState<Date | null>(guard?.joinDate ? new Date(guard.joinDate) : null);
  const [leftDate, setLeftDate] = useState<Date | null>(guard?.leftDate ? new Date(guard.leftDate) : null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (guard ? 'Guard updated successfully!' : 'Guard created successfully!'));
      onClose();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, onClose, guard]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={guard ? 'Edit Guard' : 'Add New Guard'}>
      <form action={formAction} className="space-y-4 p-4">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={guard?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. John Doe"
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Phone Field */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            id="phone"
            defaultValue={guard?.phone || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. +15550123456"
          />
          {state.errors?.phone && <p className="text-red-500 text-xs mt-1">{state.errors.phone[0]}</p>}
        </div>

        {/* Guard Code Field */}
        <div>
          <label htmlFor="guardCode" className="block text-sm font-medium text-gray-700 mb-1">
            Guard Code
          </label>
          <input
            type="text"
            name="guardCode"
            id="guardCode"
            defaultValue={guard?.guardCode || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. G001"
          />
        </div>

        {/* Status Field */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <div className="flex items-center space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="status"
                value="true"
                defaultChecked={guard?.status !== false}
                className="text-red-500 focus:ring-red-500"
              />
              <span className="ml-2 text-gray-700">Active</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="status"
                value="false"
                defaultChecked={guard?.status === false}
                className="text-red-500 focus:ring-red-500"
              />
              <span className="ml-2 text-gray-700">Inactive</span>
            </label>
          </div>
        </div>

        {/* Join Date Field */}
        <div>
          <label htmlFor="joinDate" className="block text-sm font-medium text-gray-700 mb-1">
            Join Date
          </label>
          <input type="hidden" name="joinDate" value={joinDate?.toISOString() || ''} />
          <DatePicker
            selected={joinDate}
            onChange={date => setJoinDate(date)}
            showTimeSelect
            dateFormat="MM/dd/yyyy h:mm aa"
            placeholderText="Select date and time"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            wrapperClassName="w-full"
          />
        </div>

        {/* Left Date Field */}
        <div>
          <label htmlFor="leftDate" className="block text-sm font-medium text-gray-700 mb-1">
            Left Date
          </label>
          <input type="hidden" name="leftDate" value={leftDate?.toISOString() || ''} />
          <DatePicker
            selected={leftDate}
            onChange={date => setLeftDate(date)}
            showTimeSelect
            dateFormat="MM/dd/yyyy h:mm aa"
            placeholderText="Select date and time"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            wrapperClassName="w-full"
          />
        </div>

        {/* Password Field - Only show for creation, not editing */}
        {!guard && (
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              id="password"
              required={!guard} // Only required when creating
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="Enter password (at least 6 characters)"
            />
            {state.errors?.password && <p className="text-red-500 text-xs mt-1">{state.errors.password[0]}</p>}
          </div>
        )}

        {/* Note Field */}
        <div>
          <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={guard?.note || ''}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="Additional information about the guard"
          />
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
            {isPending ? 'Saving...' : guard ? 'Save Changes' : 'Add Guard'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
