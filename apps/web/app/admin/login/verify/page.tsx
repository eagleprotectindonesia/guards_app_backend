'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export default function Verify2FA() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  // Handle paste of verification code
  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedData = e.clipboardData.getData('text');
    if (/^\d{6}$/.test(pastedData)) {
      setCode(pastedData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setError('');
    setIsPending(true);

    try {
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Verification failed');
      }

      // Successful verification
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
      setIsPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-xl bg-card p-8 shadow-lg border border-border">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-full">
            <ShieldCheck className="w-8 h-8 text-red-600 dark:text-red-500" />
          </div>
        </div>
        
        <h2 className="mb-2 text-center text-2xl font-bold text-foreground">Two-Factor Authentication</h2>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app to complete the login.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="code" className="sr-only">
              Verification Code
            </label>
            <input
              type="text"
              id="code"
              maxLength={6}
              className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-4 text-center text-3xl tracking-[0.5em] font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/20"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onPaste={handlePaste}
              required
              autoFocus
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </div>
          
          {error && (
            <div className="mb-6 p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30 text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="submit"
              disabled={isPending || code.length !== 6}
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-white font-bold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors shadow-sm shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Verifying...' : 'Verify Code'}
            </button>
            
            <button
              type="button"
              onClick={() => router.push('/admin/login')}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
