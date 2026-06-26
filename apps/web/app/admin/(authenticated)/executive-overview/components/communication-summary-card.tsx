import React from 'react';
import { Megaphone, Camera, Ticket, MessageCircle } from 'lucide-react';
import { MetricListCard } from './metric-list-card';

type Props = {
  newMemos: number;
  guardReports: number;
  ticketsReported: number;
  unreadMessages: number;
};

export function CommunicationSummaryCard({ newMemos, guardReports, ticketsReported, unreadMessages }: Props) {
  return (
    <MetricListCard
      icon={MessageCircle}
      iconAccent="sky"
      title="Communication Summary"
      subtitle="Today's Activity"
      rows={[
        { icon: Megaphone, label: 'New Memos', sublabel: 'Created today', value: newMemos, accent: 'emerald' },
        { icon: Camera, label: 'Guard Reports', sublabel: 'Photo reports today', value: guardReports, accent: 'emerald' },
        { icon: Ticket, label: 'Tickets Reported', sublabel: 'Created today', value: ticketsReported, accent: 'amber' },
        {
          icon: MessageCircle,
          label: 'Unread Messages',
          sublabel: 'Awaiting reply',
          value: unreadMessages,
          accent: 'rose',
          valueClassName: 'text-rose-600 dark:text-rose-400',
        },
      ]}
    />
  );
}
