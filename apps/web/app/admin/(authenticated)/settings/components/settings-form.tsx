'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { updateSettings } from '../actions';
import { ActionState } from '@/types/actions';
import { UpdateSettingsInput } from '@repo/validations';
import toast from 'react-hot-toast';
import { SystemSetting } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import {
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
  parseOfficeJobTitleCategoryMap,
} from '@repo/shared';

type SerializedOfficeWorkSchedule = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  settings: Serialized<SystemSetting>[];
  defaultOfficeSchedule: SerializedOfficeWorkSchedule | null;
  showDefaultOfficeSchedule: boolean;
  isSuperAdmin: boolean;
};

export default function SettingsForm({ settings, defaultOfficeSchedule, showDefaultOfficeSchedule, isSuperAdmin }: Props) {
  const officeJobTitleMapSetting = settings.find(setting => setting.name === OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING);
  const officeAttendanceDistanceSetting = settings.find(
    setting => setting.name === OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING
  );
  const officeJobTitleMap = parseOfficeJobTitleCategoryMap(officeJobTitleMapSetting?.value);
  const generalSettings = settings.filter(
    setting =>
      setting.name !== OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING &&
      setting.name !== OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING
  );

  const [state, formAction, isPending] = useActionState<ActionState<UpdateSettingsInput>, FormData>(updateSettings, {
    success: false,
  });

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

      {showDefaultOfficeSchedule && defaultOfficeSchedule ? (
        <div className="space-y-6 mb-8">
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Default Office Schedule</h2>
              <p className="text-sm text-muted-foreground mt-1">Reference details for the default office schedule.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule ID</p>
                <p className="mt-1 font-mono text-sm text-foreground break-all">{defaultOfficeSchedule.id}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule Name</p>
                <p className="mt-1 text-sm font-medium text-foreground">{defaultOfficeSchedule.name}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-6">
        <div className="rounded-lg border border-border bg-muted/20 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Office Job Title Categorization</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Map external office employee job titles into staff or management, and define the office attendance
              distance setting for future use.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <label htmlFor="officeJobTitles:staff" className="block font-medium text-foreground mb-1">
                Staff Titles
              </label>
              <textarea
                name="officeJobTitles:staff"
                id="officeJobTitles:staff"
                defaultValue={officeJobTitleMap.staff.join('\n')}
                readOnly={!isSuperAdmin}
                rows={8}
                className={`w-full px-3 py-2 rounded-lg border outline-none transition-all text-sm resize-y ${
                  isSuperAdmin
                    ? 'border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
                    : 'border-transparent bg-transparent text-muted-foreground'
                }`}
                placeholder="One external job title per line"
              />
              <p className="text-xs text-muted-foreground mt-2">Exact-match titles, one per line.</p>
            </div>

            <div>
              <label htmlFor="officeJobTitles:management" className="block font-medium text-foreground mb-1">
                Management Titles
              </label>
              <textarea
                name="officeJobTitles:management"
                id="officeJobTitles:management"
                defaultValue={officeJobTitleMap.management.join('\n')}
                readOnly={!isSuperAdmin}
                rows={8}
                className={`w-full px-3 py-2 rounded-lg border outline-none transition-all text-sm resize-y ${
                  isSuperAdmin
                    ? 'border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
                    : 'border-transparent bg-transparent text-muted-foreground'
                }`}
                placeholder="One external job title per line"
              />
              <p className="text-xs text-muted-foreground mt-2">Duplicates across categories are rejected.</p>
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="officeAttendanceMaxDistance" className="block font-medium text-foreground mb-1">
              Office Attendance Max Distance (meters)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              name="officeAttendanceMaxDistance"
              id="officeAttendanceMaxDistance"
              defaultValue={officeAttendanceDistanceSetting?.value || '10'}
              readOnly={!isSuperAdmin}
              className={`w-full md:w-72 h-10 px-3 rounded-lg border outline-none transition-all ${
                isSuperAdmin
                  ? 'border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
                  : 'border-transparent bg-transparent text-muted-foreground font-medium'
              }`}
            />
            <p className="text-xs text-muted-foreground mt-2">
              This is stored now for the later office-attendance enforcement phase.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {generalSettings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 italic">No system settings found in database.</p>
          ) : (
            generalSettings.map(setting => (
              <div key={setting.name} className="flex flex-col gap-4 p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <label
                      htmlFor={`value:${setting.name}`}
                      senior-id={`value:${setting.name}`}
                      className="block font-bold text-foreground text-sm uppercase tracking-tight"
                    >
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
                    <label
                      htmlFor={`note:${setting.name}`}
                      senior-id={`note:${setting.name}`}
                      className="block text-muted-foreground text-xs font-semibold uppercase"
                    >
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
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
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
