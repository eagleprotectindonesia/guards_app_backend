import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { History, Clock } from 'lucide-react';
import { cn } from '@repo/shared';
import type { ChangelogFeedItem } from '@repo/database';

type Props = {
  changelogs: ChangelogFeedItem[];
};

function getBadgeStyles(entityType: string) {
  const type = entityType.toLowerCase();
  if (type === 'employee') return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
  if (type === 'admin') return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
  if (type === 'site') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  if (type === 'shift') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  if (type === 'officeshift' || type === 'office_shift')
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
}

function getDisplayName(entityType: string) {
  const typeLower = entityType.toLowerCase();
  if (typeLower === 'officeshift' || typeLower === 'office_shift') return 'Office Shift';
  return entityType;
}

export function HrChangelogPanel({ changelogs }: Props) {
  return (
    <Card className="border-border/60 bg-card shadow-md flex flex-col h-full">
      <CardHeader className="border-b border-border/45 pb-4 flex flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
            <History className="h-4 w-4 text-purple-500" />
            Latest Changelog
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Recent changes and audit logs for system entities.
          </CardDescription>
        </div>

      </CardHeader>
      <CardContent className="pt-2 flex-1 max-h-80 overflow-y-auto">
        {changelogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Clock className="h-8 w-8 text-muted-foreground/35" />
            <p className="text-xs text-muted-foreground">No recent changelog records found.</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul className="-mb-4">
              {changelogs.map((log, logIdx) => {
                const displayName = getDisplayName(log.entityType);
                const badgeText = `${displayName.toLowerCase()} ${log.action}`;

                return (
                  <li key={log.id}>
                    <div className="relative pb-4">
                      {logIdx !== changelogs.length - 1 ? (
                        <span className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-border/40" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-10 w-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center ring-8 ring-card">
                            <span className="h-2 w-2 rounded-full bg-purple-500" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col pt-1.5">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold border shrink-0 capitalize',
                                getBadgeStyles(log.entityType)
                              )}
                            >
                              {badgeText}
                            </span>
                            <p className="text-sm text-foreground/90 font-medium truncate">{log.message}</p>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            <time dateTime={log.createdAt.toISOString()}>
                              {new Date(log.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
