'use client';

import { Serialized } from '@/lib/utils';
import { createGuard, updateGuard } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateGuardInput, createGuardSchema, updateGuardSchema } from '@/lib/validations';
import { startTransition, useActionState, useEffect, useRef } from 'react';
import { useForm, Controller, Resolver, Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Guard } from '@prisma/client';
import { DatePicker } from '@/components/ui/date-picker';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';
import PhoneInput from '@/components/ui/phone-input';
import { E164Number } from 'libphonenumber-js';
import { format } from 'date-fns';

type Props = {
  guard?: Serialized<Guard>; // If provided, it's an edit form
};

export default function GuardForm({ guard }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionState<CreateGuardInput>, FormData>(
    guard ? updateGuard.bind(null, guard.id) : createGuard,
    { success: false }
  );

  const {
    register,
    control,
    setError,
    clearErrors,
    trigger,
    formState: { errors },
  } = useForm<CreateGuardInput>({
    resolver: zodResolver(guard ? updateGuardSchema : createGuardSchema) as Resolver<CreateGuardInput>,
    defaultValues: {
      name: guard?.name || '',
      phone: (guard?.phone as string) || '',
      id: guard?.id || '',
      guardCode: guard?.guardCode || '',
      status: guard?.status ?? true,
      joinDate: guard?.joinDate ? new Date(guard.joinDate) : undefined,
      leftDate: guard?.leftDate ? new Date(guard.leftDate) : undefined,
      note: guard?.note || '',
    },
  });

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (guard ? 'Guard updated successfully!' : 'Guard created successfully!'));
      router.push('/admin/guards');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }

    if (state.errors) {
      Object.entries(state.errors).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          setError(key as Path<CreateGuardInput>, { type: 'server', message: value[0] });
        }
      });
    }
  }, [state, guard, router, setError]);

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
      <h1 className="text-2xl font-bold text-foreground mb-6">{guard ? 'Edit Guard' : 'Add New Guard'}</h1>
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
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block font-medium text-foreground mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register('name')}
              type="text"
              id="name"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
              placeholder="e.g. John Doe"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
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

          {/* Employee ID Field */}
          <div>
            <label htmlFor="id" className="block font-medium text-foreground mb-1">
              Employee ID <span className="text-red-500">*</span>
            </label>
            <Controller
              control={control}
              name="id"
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  id="id"
                  readOnly={!!guard}
                  maxLength={6}
                  minLength={6}
                  title="Employee ID must be exactly 6 alphanumeric characters"
                  className={`w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all ${
                    guard ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
                  }`}
                  placeholder="e.g. EMP001"
                  autoComplete="off"
                  onChange={e => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    field.onChange(val);
                  }}
                />
              )}
            />
            {errors.id && <p className="text-red-500 text-xs mt-1">{errors.id.message}</p>}
          </div>

          {/* Guard Code Field */}
          <div>
            <label htmlFor="guardCode" className="block font-medium text-foreground mb-1">
              Guard Code <span className="text-red-500">*</span>
            </label>
            <Controller
              control={control}
              name="guardCode"
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  id="guardCode"
                  maxLength={12}
                  title="Guard code must be alphanumeric only, maximum 12 characters"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                  placeholder="e.g. G001"
                  autoComplete="off"
                  onChange={e => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    field.onChange(val);
                  }}
                />
              )}
            />
            {errors.guardCode && <p className="text-red-500 text-xs mt-1">{errors.guardCode.message}</p>}
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

          {/* Join Date Field */}
          <div>
            <label htmlFor="joinDate" className="block font-medium text-foreground mb-1">
              Join Date <span className="text-red-500">*</span>
            </label>
            <Controller
              control={control}
              name="joinDate"
              render={({ field }) => (
                <>
                  <input type="hidden" name="joinDate" value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} />
                  <DatePicker
                    date={field.value}
                    setDate={field.onChange}
                    placeholder="Select date"
                    className={`w-full h-10 px-3 rounded-lg border ${
                      errors.joinDate ? 'border-red-500' : 'border-border'
                    } bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                  />
                </>
              )}
            />
            {errors.joinDate && <p className="text-red-500 text-xs mt-1">{errors.joinDate.message}</p>}
          </div>

          {/* Left Date Field */}
          <div>
            <label htmlFor="leftDate" className="block font-medium text-foreground mb-1">
              Left Date
            </label>
            <Controller
              control={control}
              name="leftDate"
              render={({ field }) => (
                <>
                  <input type="hidden" name="leftDate" value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} />
                  <DatePicker
                    date={field.value}
                    setDate={field.onChange}
                    placeholder="Select date"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  />
                </>
              )}
            />
          </div>

          {/* Password Field - Only show for creation, not editing */}
          {!guard && (
            <div className="md:col-span-2">
              <label htmlFor="password" className="block font-medium text-foreground mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                {...register('password')}
                id="password"
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                placeholder="Enter password (at least 6 characters)"
                autoComplete="new-password"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          )}

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
              placeholder="Additional information about the guard"
            />
          </div>
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/guards')}
            className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
          >
            {isPending ? 'Saving...' : guard ? 'Save Changes' : 'Create Guard'}
          </button>
        </div>
      </form>
    </div>
  );
}
