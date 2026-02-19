'use client';

import { Serialized } from '@/lib/utils';
import { updateEmployee } from '../actions';
import { ActionState } from '@/types/actions';
import { updateEmployeeSchema, UpdateEmployeeInput } from '@/lib/validations';
import { startTransition, useActionState, useEffect, useRef } from 'react';
import { useForm, Controller, Resolver, Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { EmployeeWithRelations } from '@repo/database';
import { useRouter } from 'next/navigation';
import PhoneInput from '@/components/ui/phone-input';
import { E164Number } from 'libphonenumber-js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeRole } from '@prisma/client';

type Props = {
  employee: Serialized<EmployeeWithRelations>;
};

export default function EmployeeForm({ employee }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionState<UpdateEmployeeInput>, FormData>(
    updateEmployee.bind(null, employee.id),
    { success: false }
  );

  const {
    register,
    control,
    setError,
    clearErrors,
    trigger,
    formState: { errors },
  } = useForm<UpdateEmployeeInput>({
    resolver: zodResolver(updateEmployeeSchema) as Resolver<UpdateEmployeeInput>,
    defaultValues: {
      fullName: employee.fullName || '',
      nickname: employee.nickname || '',
      phone: (employee.phone as string) || '',
      id: employee.id || '',
      employeeNumber: employee.employeeNumber || '',
      personnelId: employee.personnelId || '',
      jobTitle: employee.jobTitle || '',
      department: employee.department || '',
      role: (employee.role as EmployeeRole) || undefined,
      status: employee.status ?? true,
      note: employee.note || '',
    },
  });

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Employee updated successfully!');
      router.push('/admin/employees');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }

    if (state.errors) {
      Object.entries(state.errors).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          setError(key as Path<UpdateEmployeeInput>, { type: 'server', message: value[0] });
        }
      });
    }
  }, [state, employee, router, setError]);

  const clientAction = async (formData: FormData) => {
    clearErrors();

    const isValid = await trigger();
    if (isValid) {
      startTransition(() => {
        formAction(formData);
      });
    } else {
      // Scroll to the first error
      const firstError = Object.keys(errors)[0];

      if (firstError) {
        const element = document.getElementById(firstError);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">Edit Employee</h1>
      <form
        ref={formRef}
        onSubmit={e => {
          e.preventDefault();
          clientAction(new FormData(e.currentTarget));
        }}
        className="space-y-6"
        autoComplete="off"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Full Name Field */}
          <div className="md:col-span-2">
            <label htmlFor="fullName" className="block font-medium text-foreground mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register('fullName')}
              type="text"
              id="fullName"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. John Doe"
            />
            {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
          </div>

          {/* Nickname Field */}
          <div>
            <label htmlFor="nickname" className="block font-medium text-foreground mb-1">
              Nickname
            </label>
            <input
              {...register('nickname')}
              type="text"
              id="nickname"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. Johnny"
            />
          </div>

          {/* Phone Field */}
          <div>
            <label htmlFor="phone" className="block font-medium text-foreground mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  inputName="phone"
                  id="phone"
                  defaultValue={field.value as E164Number}
                  onChange={field.onChange}
                  placeholder="e.g. +62550123456"
                  maxLength={18}
                />
              )}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>

          {/* System ID Field (Read-only) */}
          <div>
            <label htmlFor="id" className="block font-medium text-foreground mb-1">
              System ID (Unique) <span className="text-red-500">*</span>
            </label>
            <input
              {...register('id')}
              type="text"
              id="id"
              readOnly
              className="w-full h-10 px-3 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed outline-none transition-all"
              placeholder="e.g. ADM001"
            />
            {errors.id && <p className="text-red-500 text-xs mt-1">{errors.id.message}</p>}
          </div>

          {/* Employee Number Field */}
          <div>
            <label htmlFor="employeeNumber" className="block font-medium text-foreground mb-1">
              Employee Number
            </label>
            <input
              {...register('employeeNumber')}
              type="text"
              id="employeeNumber"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. 123456"
            />
            {errors.employeeNumber && <p className="text-red-500 text-xs mt-1">{errors.employeeNumber.message}</p>}
          </div>

          {/* Personnel ID Field */}
          <div>
            <label htmlFor="personnelId" className="block font-medium text-foreground mb-1">
              Personnel ID
            </label>
            <input
              {...register('personnelId')}
              type="text"
              id="personnelId"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="Internal HR ID"
            />
          </div>

          {/* Job Title Field */}
          <div>
            <label htmlFor="jobTitle" className="block font-medium text-foreground mb-1">
              Job Title
            </label>
            <input
              {...register('jobTitle')}
              type="text"
              id="jobTitle"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. Security Guard"
            />
          </div>

          {/* Department Field */}
          <div>
            <label htmlFor="department" className="block font-medium text-foreground mb-1">
              Department
            </label>
            <input
              {...register('department')}
              type="text"
              id="department"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. Operations"
            />
          </div>

          {/* Role Field */}
          <div>
            <label htmlFor="role" className="block font-medium text-foreground mb-1">
              App Role
            </label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value || undefined}
                  value={field.value || undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_site">On-Site Guard</SelectItem>
                    <SelectItem value="office">Office Staff</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Status Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Status</label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <div className="flex items-center space-x-4 h-10">
                  <input type="hidden" name="status" value={field.value ? 'true' : 'false'} />
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      checked={field.value === true}
                      onChange={() => field.onChange(true)}
                      className="text-red-600 focus:ring-red-600"
                    />
                    <span className="ml-2 text-foreground">Active</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      checked={field.value === false}
                      onChange={() => field.onChange(false)}
                      className="text-red-600 focus:ring-red-600"
                    />
                    <span className="ml-2 text-foreground">Inactive</span>
                  </label>
                </div>
              )}
            />
          </div>

          {/* Note Field */}
          <div className="md:col-span-2">
            <label htmlFor="note" className="block font-medium text-foreground mb-1">
              Note
            </label>
            <textarea
              {...register('note')}
              id="note"
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="Additional information about the employee"
            />
          </div>
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/employees')}
            className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
