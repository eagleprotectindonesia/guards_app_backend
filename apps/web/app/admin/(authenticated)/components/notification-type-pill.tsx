import { cn } from '@repo/shared';

export type NotificationTag =
  | 'Alert'
  | 'Critical'
  | 'Warning'
  | 'Calendar'
  | 'Message'
  | 'Ticket'
  | 'Leave'
  | 'Reassignment';

const tagStyles: Record<NotificationTag, string> = {
  Alert: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  Calendar: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Message: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Ticket: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Reassignment: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

export function NotificationTypePill({ tag }: { tag: NotificationTag }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
        tagStyles[tag]
      )}
    >
      {tag}
    </span>
  );
}
