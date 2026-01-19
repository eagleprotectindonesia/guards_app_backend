'use client';

import { useEffect, useState } from 'react';
import { ModeToggle } from '@/components/mode-toggle';
import AlertNotifications from './alert-notifications';
import { AdminSession } from '@/lib/admin-auth';
import AdminProfileDropdown from './admin-profile-dropdown';

function DigitalClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    const timeout = setTimeout(() => {
      setTime(new Date());
    }, 0);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  if (!time) return null;

  return (
    <div className="flex items-center gap-2 text-foreground/80 font-medium">
      <span className="text-lg tabular-nums">
        {time.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit'
        })}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-muted-foreground font-normal">
        {time.toLocaleDateString('en-GB', { 
          weekday: 'short', 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        })}
      </span>
    </div>
  );
}

export default function Header({ currentAdmin }: { currentAdmin: AdminSession }) {
  return (
    <header className="h-16 bg-background border-b border-border px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <DigitalClock />
      </div>
      
      <div className="flex items-center gap-4">
        <AlertNotifications />
        <ModeToggle />
        <AdminProfileDropdown currentAdmin={currentAdmin} />
      </div>
    </header>
  );
}
