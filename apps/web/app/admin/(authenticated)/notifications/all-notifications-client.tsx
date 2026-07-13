'use client';

import { useNotificationsDropdown } from '../context/notifications-dropdown-context';
import { NotificationRow } from '../components/notification-row';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AllNotificationsClient() {
  const { items, unreadCount, isInitialized } = useNotificationsDropdown();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/new-dashboard" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isInitialized ? `${items.length} notification${items.length === 1 ? '' : 's'}` : 'Loading...'}
            {unreadCount > 0 && ` (${unreadCount} unread)`}
          </p>
        </div>
      </div>

      {!isInitialized ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {items.map(item => (
            <NotificationRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
