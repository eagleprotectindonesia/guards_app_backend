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
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSuperAdmin 
            ? 'Configure global application parameters.' 
            : 'View global application parameters. (Read-only)'}
        </p>
      </div>

      <form action={formAction} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          {settings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 italic">No system settings found in database.</p>
          ) : (
            settings.map((setting) => (
              <div key={setting.name} className="flex flex-col gap-4 p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <label htmlFor={`value:${setting.name}`} senior-id={`value:${setting.name}`} className="block font-bold text-foreground text-sm uppercase tracking-tight">
                      {setting.name.replace(/_/g, ' ')}
                    </label>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{setting.name}</p>
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
                          ? 'border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20' 
                          : 'border-transparent bg-transparent text-muted-foreground font-medium'
                      }`}
                    />
                    {state.errors?.[setting.name] && (
                      <p className="text-red-500 text-xs mt-1">{state.errors[setting.name]?.[0]}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-4 pt-2 border-t border-border/50">
                  <div className="flex-1">
                    <label htmlFor={`note:${setting.name}`} senior-id={`note:${setting.name}`} className="block text-muted-foreground text-xs font-semibold uppercase">
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
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none placeholder:text-muted-foreground"
                        placeholder="Add a description for this setting..."
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">
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
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">{state.message}</div>
        )}

        {/* Actions */}
        {isSuperAdmin && (
          <div className="flex justify-end pt-4 border-t border-border">
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
