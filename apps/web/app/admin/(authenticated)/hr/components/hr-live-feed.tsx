'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Clock, Calendar, Briefcase, Activity } from 'lucide-react';
import { useSocket } from '@/components/socket-provider';

export interface HrActivity {
  id: string;
  type: 'office_shift_created' | 'leave_request_created';
  occurredAt: string;
  employeeName: string;
  details: string;
}

type Props = {
  initialActivities: HrActivity[];
};

export function HrLiveFeed({ initialActivities }: Props) {
  const [activities, setActivities] = useState<HrActivity[]>(initialActivities);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleHrActivity = (payload: unknown) => {
      try {
        const newActivity = (typeof payload === 'string' ? JSON.parse(payload) : payload) as HrActivity;
        setActivities(prev => {
          // Check for duplicate
          if (prev.some(act => act.id === newActivity.id)) {
            return prev;
          }
          const updated = [newActivity, ...prev];
          return updated.slice(0, 5); // Capped at 5 latest
        });
      } catch (error) {
        console.error('Failed to parse socket HR activity:', error);
      }
    };

    socket.on('hr_live_activity', handleHrActivity);

    return () => {
      socket.off('hr_live_activity', handleHrActivity);
    };
  }, [socket]);

  return (
    <Card className="border-border/60 bg-card shadow-md flex flex-col h-full justify-between">
      <CardHeader className="border-b border-border/45 pb-4 flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity className="h-4.5 w-4.5 text-blue-500 animate-pulse animate-duration-1000" />
            Live HR Feed
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Real-time feed of shift allocations and leave requests.
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-[10px] text-muted-foreground">{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-6 flex-1 flex flex-col gap-4 justify-start">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Clock className="h-8 w-8 text-muted-foreground/35" />
            <p className="text-xs text-muted-foreground">No recent HR activities.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const isLeave = activity.type === 'leave_request_created';
              const Icon = isLeave ? Calendar : Briefcase;
              const iconColor = isLeave ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400';
              const bgClass = isLeave ? 'bg-amber-500/10 border-amber-500/20' : 'bg-sky-500/10 border-sky-500/20';

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/10 hover:bg-muted/20 hover:border-border/60 transition-all duration-200"
                >
                  <div className={`p-2 rounded-lg ${bgClass} shrink-0 border`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">
                      {activity.employeeName}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      {activity.details}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                      <Clock className="h-3 w-3" />
                      <span>
                        {new Date(activity.occurredAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
