'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button'; // Assuming this exists for styling

type GuardLoginState = {
  success?: boolean;
  message?: string;
};

async function guardLoginAction(
  prevState: GuardLoginState,
  formData: FormData
): Promise<GuardLoginState> {
  const phone = formData.get('phone') as string;
  const password = formData.get('password') as string;

  if (!phone || !password) {
    return { message: 'Phone and password are required.' };
  }

  const res = await fetch('/api/auth/guard/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, password }),
  });

  const data = await res.json();

  if (res.ok) {
    return { success: true, message: 'Login successful!' };
  } else {
    return { success: false, message: data.message || 'Login failed.' };
  }
}

export default function GuardLoginPage() {
  const router = useRouter();
  const [state, formAction] = useActionState(guardLoginAction, {});

  if (state.success) {
    router.push('/guard'); // Redirect to guard dashboard after successful login
    return null;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Guard Login</h1>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              type="text"
              id="phone"
              name="phone"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <Button type="submit" className="w-full">
            Login
          </Button>
          {state.message && (
            <p className={`mt-4 text-center text-sm ${state.success ? 'text-green-600' : 'text-red-600'}`}>
              {state.message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
