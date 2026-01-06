'use client';

import { useActionState, useEffect } from 'react';
import { updateSettings } from '../actions';
import { ActionState } from '@/types/actions';
import { UpdateSettingsInput } from '@/lib/validations';
import toast from 'react-hot-toast';
import { SystemSetting } from '@prisma/client';
import { Serialized } from '@/lib/utils';

type Props = {
  settings: Serialized<SystemSetting>[];
  isSuperAdmin: boolean;
};

export default function SettingsForm({ settings, isSuperAdmin }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState<UpdateSettingsInput>, FormData>(
    updateSettings,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Settings updated successfully!');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isSuperAdmin 
            ? 'Configure global application parameters.' 
            : 'View global application parameters. (Read-only)'}
        </p>
      </div>

      <form action={formAction} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          {settings.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 italic">No system settings found in database.</p>
          ) : (
            settings.map((setting) => (
              <div key={setting.name} className="flex flex-col gap-4 p-4 rounded-lg bg-gray-50/50 border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <label htmlFor={`value:${setting.name}`} className="block font-bold text-gray-700 text-sm uppercase tracking-tight">
                      {setting.name.replace(/_/g, ' ')}
                    </label>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{setting.name}</p>
                  </div>
                  <div className="flex-[2]">
                    <input
                      type="text"
                      name={`value:${setting.name}`}
                      id={`value:${setting.name}`}
                      defaultValue={setting.value}
                      readOnly={!isSuperAdmin}
                      className={`w-full h-10 px-3 rounded-lg border outline-none transition-all ${
                        isSuperAdmin 
                          ? 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white' 
                          : 'border-transparent bg-transparent text-gray-600 font-medium'
                      }`}
                    />
                    {state.errors?.[setting.name] && (
                      <p className="text-red-500 text-xs mt-1">{state.errors[setting.name]?.[0]}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-4 pt-2 border-t border-gray-100/50">
                  <div className="flex-1">
                    <label htmlFor={`note:${setting.name}`} className="block text-gray-500 text-xs font-semibold uppercase">
                      Description / Note
                    </label>
                  </div>
                  <div className="flex-[2]">
                    {isSuperAdmin ? (
                      <textarea
                        name={`note:${setting.name}`}
                        id={`note:${setting.name}`}
                        defaultValue={setting.note || ''}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white text-sm resize-none"
                        placeholder="Add a description for this setting..."
                      />
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        {setting.note || 'No description provided.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        {isSuperAdmin && (
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={isPending || settings.length === 0}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/30"
            >
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
