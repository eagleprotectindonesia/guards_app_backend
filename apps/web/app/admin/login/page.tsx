'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Login failed');
      }

      const data = await response.json();

      if (data.requires2FA) {
        router.push('/admin/login/verify');
        return;
      }

      // Assuming successful login, redirect to admin dashboard
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-xl bg-card p-8 shadow-lg border border-border">
        <h2 className="mb-6 text-center text-2xl font-bold text-foreground">Admin Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" senior-id="email" className="mb-2 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              type="email"
              id="email"
              className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/50"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" senior-id="password" className="mb-2 block text-sm font-medium text-foreground">
              Password
            </label>
            <PasswordInput
              id="password"
              className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30 text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-white font-bold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors shadow-sm shadow-red-500/20"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
