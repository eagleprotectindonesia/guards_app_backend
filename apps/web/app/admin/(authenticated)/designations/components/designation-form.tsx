'use client';

import { Serialized } from '@/lib/utils';
import { createDesignationAction, updateDesignationAction } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateDesignationInput } from '@/lib/validations';
import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Designation, Department } from '@repo/types';
import { useRouter } from 'next/navigation';

type Props = {
  designation?: Serialized<Designation>;
  departments: Serialized<Department>[];
};

export default function DesignationForm({ designation, departments }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateDesignationInput>, FormData>(
    designation ? updateDesignationAction.bind(null, designation.id) : createDesignationAction,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (designation ? 'Designation updated successfully!' : 'Designation created successfully!'));
      router.push('/admin/designations');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, designation, router]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">{designation ? 'Edit Designation' : 'Create New Designation'}</h1>
      <form action={formAction} className="space-y-6">
        <div>
          <label htmlFor="name" className="block font-medium text-foreground mb-1">
            Designation Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={designation?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
            placeholder="e.g. Senior Guard"
            required
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        <div>
          <label htmlFor="departmentId" className="block font-medium text-foreground mb-1">
            Department
          </label>
          <select
            name="departmentId"
            id="departmentId"
            defaultValue={designation?.departmentId || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            required
          >
            <option value="" disabled>Select a department</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
          {state.errors?.departmentId && <p className="text-red-500 text-xs mt-1">{state.errors.departmentId[0]}</p>}
        </div>

        <div>
          <label htmlFor="note" className="block font-medium text-foreground mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={designation?.note || ''}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground"
            placeholder="Add any additional information about the designation..."
          />
          {state.errors?.note && <p className="text-red-500 text-xs mt-1">{state.errors.note[0]}</p>}
        </div>

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/designations')}
            className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
          >
            {isPending ? 'Saving...' : designation ? 'Save Changes' : 'Create Designation'}
          </button>
        </div>
      </form>
    </div>
  );
}
