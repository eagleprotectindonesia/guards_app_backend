'use client';

import { useEffect, useState } from 'react';
import { ModeToggle } from '@/components/mode-toggle';
import { useAlerts } from '../context/alert-context';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

export default function Header() {
  const { isMuted, setIsMuted, alerts } = useAlerts();
  
  const activeAlerts = alerts.filter(
    (alert) => !alert.acknowledgedAt && !alert.resolvedAt && alert.status !== 'need_attention'
  );
  const hasActiveAlerts = activeAlerts.length > 0;

  return (
    <header className="h-16 bg-background border-b border-border px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <DigitalClock />
      </div>
      
      <div className="flex items-center gap-4">
        {hasActiveAlerts && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "relative",
              !isMuted && "text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 animate-pulse"
            )}
            title={isMuted ? "Unmute alarm" : "Mute alarm"}
          >
            {isMuted ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </Button>
        )}
        <ModeToggle />
      </div>
    </header>
  );
}
