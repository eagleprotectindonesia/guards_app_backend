'use client';

import { Serialized } from '@/lib/utils';
import { createEmployee, updateEmployee } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateEmployeeInput, createEmployeeSchema, updateEmployeeSchema } from '@/lib/validations';
import { startTransition, useActionState, useEffect, useRef, useMemo } from 'react';
import { useForm, Controller, Resolver, Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Department, Designation, Office } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';
import { DatePicker } from '@/components/ui/date-picker';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';
import PhoneInput from '@/components/ui/phone-input';
import { E164Number } from 'libphonenumber-js';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  employee?: Serialized<ExtendedEmployee>; // If provided, it's an edit form
  departments?: Serialized<Department>[];
  designations?: Serialized<Designation>[];
  offices?: Serialized<Office>[];
};

export default function EmployeeForm({ 
  employee, 
  departments = [], 
  designations = [],
  offices = []
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionState<CreateEmployeeInput>, FormData>(
    employee ? updateEmployee.bind(null, employee.id) : createEmployee,
    { success: false }
  );

  const {
    register,
    control,
    setError,
    clearErrors,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(employee ? updateEmployeeSchema : createEmployeeSchema) as Resolver<CreateEmployeeInput>,
    defaultValues: {
      title: (employee?.title as 'Mr' | 'Miss' | 'Mrs') || 'Mr',
      firstName: employee?.firstName || '',
      lastName: employee?.lastName || '',
      phone: (employee?.phone as string) || '',
      id: employee?.id || '',
      employeeCode: employee?.employeeCode || '',
      status: employee?.status ?? true,
      departmentId: employee?.departmentId || '',
      designationId: employee?.designationId || '',
      officeId: employee?.officeId || '',
      joinDate: employee?.joinDate ? new Date(employee.joinDate) : undefined,
      leftDate: employee?.leftDate ? new Date(employee.leftDate) : undefined,
      note: employee?.note || '',
    },
  });

  const [firstName, lastName, selectedDepartmentId, selectedDesignationId] = watch([
    'firstName', 
    'lastName', 
    'departmentId',
    'designationId'
  ]);

  const fullName = `${firstName || ''} ${lastName || ''}`.trim();

  const filteredDesignations = useMemo(() => {
    if (!selectedDepartmentId) return [];
    return designations.filter(d => d.departmentId === selectedDepartmentId);
  }, [selectedDepartmentId, designations]);

  const isOfficeRole = useMemo(() => {
    const designation = designations.find(d => d.id === selectedDesignationId);
    return designation?.role === 'office';
  }, [selectedDesignationId, designations]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (employee ? 'Employee updated successfully!' : 'Employee created successfully!'));
      router.push('/admin/employees');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }

    if (state.errors) {
      Object.entries(state.errors).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          setError(key as Path<CreateEmployeeInput>, { type: 'server', message: value[0] });
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
      <h1 className="text-2xl font-bold text-foreground mb-6">{employee ? 'Edit Employee' : 'Add New Employee'}</h1>
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
          {/* Title & Full Name Row */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Title Field */}
            <div className="md:col-span-1">
              <label htmlFor="title" className="block font-medium text-foreground mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <Controller
                control={control}
                name="title"
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value ?? undefined}
                    value={field.value ?? undefined}
                    name={field.name}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Title" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Miss">Miss</SelectItem>
                      <SelectItem value="Mrs">Mrs</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            {/* Full Name Field */}
            <div className="md:col-span-3">
              <label htmlFor="fullName" className="block font-medium text-foreground mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="fullName"
                defaultValue={fullName}
                onChange={e => {
                  const value = e.target.value;
                  const trimmed = value.trim();

                  if (trimmed.length <= 15) {
                    setValue('firstName', trimmed, { shouldValidate: true });
                    setValue('lastName', '', { shouldValidate: true });
                  } else {
                    const first15 = trimmed.substring(0, 15);
                    const lastSpaceIndex = first15.lastIndexOf(' ');

                    if (lastSpaceIndex !== -1) {
                      setValue('firstName', trimmed.substring(0, lastSpaceIndex), { shouldValidate: true });
                      setValue('lastName', trimmed.substring(lastSpaceIndex + 1), { shouldValidate: true });
                    } else {
                      setValue('firstName', trimmed.substring(0, 15), { shouldValidate: true });
                      setValue('lastName', trimmed.substring(15), { shouldValidate: true });
                    }
                  }
                }}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                placeholder="e.g. John Doe"
              />
            </div>
          </div>

          {/* Hidden inputs for form submission */}
          <input type="hidden" {...register('firstName')} />
          <input type="hidden" {...register('lastName')} />

          {/* First Name Field (Disabled) */}
          <div>
            <label className="block font-medium text-muted-foreground mb-1">First Name</label>
            <input
              type="text"
              disabled
              value={firstName}
              className="w-full h-10 px-3 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed outline-none transition-all"
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
          </div>

          {/* Last Name Field (Disabled) */}
          <div>
            <label className="block font-medium text-muted-foreground mb-1">Last Name</label>
            <input
              type="text"
              disabled
              value={lastName}
              className="w-full h-10 px-3 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed outline-none transition-all"
            />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
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
                  readOnly={!!employee}
                  maxLength={6}
                  minLength={6}
                  title="Employee ID must be exactly 6 alphanumeric characters"
                  className={`w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all ${
                    employee ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
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

          {/* Employee Code Field */}
          <div>
            <label htmlFor="employeeCode" className="block font-medium text-foreground mb-1">
              Employee Code <span className="text-red-500">*</span>
            </label>
            <Controller
              control={control}
              name="employeeCode"
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  id="employeeCode"
                  maxLength={12}
                  title="Employee code must be alphanumeric only, maximum 12 characters"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                  placeholder="e.g. E001"
                  autoComplete="off"
                  onChange={e => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    field.onChange(val);
                  }}
                />
              )}
            />
            {errors.employeeCode && <p className="text-red-500 text-xs mt-1">{errors.employeeCode.message}</p>}
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

          {/* Department Field */}
          <div>
            <label htmlFor="departmentId" className="block font-medium text-foreground mb-1">
              Department
            </label>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select
                  onValueChange={value => {
                    field.onChange(value);
                    setValue('designationId', '');
                  }}
                  defaultValue={field.value ?? undefined}
                  value={field.value ?? undefined}
                  name={field.name}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.departmentId && <p className="text-red-500 text-xs mt-1">{errors.departmentId.message}</p>}
          </div>

          {/* Designation Field */}
          <div>
            <label htmlFor="designationId" className="block font-medium text-foreground mb-1">
              Designation
            </label>
            <Controller
              control={control}
              name="designationId"
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value ?? undefined}
                  value={field.value ?? undefined}
                  name={field.name}
                  disabled={!selectedDepartmentId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDesignations.map(desig => (
                      <SelectItem key={desig.id} value={desig.id}>
                        {desig.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.designationId && <p className="text-red-500 text-xs mt-1">{errors.designationId.message}</p>}
          </div>

          {/* Office Field - Only show if designation role is office */}
          {isOfficeRole && (
            <div>
              <label htmlFor="officeId" className="block font-medium text-foreground mb-1">
                Office
              </label>
              <Controller
                control={control}
                name="officeId"
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value ?? undefined}
                    value={field.value ?? undefined}
                    name={field.name}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Office" />
                    </SelectTrigger>
                    <SelectContent>
                      {offices.map(office => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.officeId && <p className="text-red-500 text-xs mt-1">{errors.officeId.message}</p>}
            </div>
          )}

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
          {!employee && (
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
            {isPending ? 'Saving...' : employee ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </form>
    </div>
  );
}
