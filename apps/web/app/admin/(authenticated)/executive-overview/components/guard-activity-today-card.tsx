import React from 'react';
import { CalendarClock, UserCheck, UserX, TriangleAlert } from 'lucide-react';
import { MetricListCard } from './metric-list-card';

type Props = {
  scheduled: number;
  checkedIn: number;
  missedCheckIn: number;
  sosEmergencies: number;
};

export function GuardActivityTodayCard({ scheduled, checkedIn, missedCheckIn, sosEmergencies }: Props) {
  return (
    <MetricListCard
      icon={CalendarClock}
      iconAccent="emerald"
      title="Guard Activity Today"
      subtitle="Scheduled vs Checked In"
      rows={[
        { icon: CalendarClock, label: 'Scheduled Guards', sublabel: 'Today', value: scheduled, accent: 'neutral' },
        { icon: UserCheck, label: 'Checked In', sublabel: 'Attendance', value: checkedIn, accent: 'emerald' },
        { icon: UserX, label: 'Missed Check-In', sublabel: 'Without attendance', value: missedCheckIn, accent: 'rose' },
        { icon: TriangleAlert, label: 'SOS / Emergencies', sublabel: 'Unresolved panic', value: sosEmergencies, accent: 'rose' },
      ]}
    />
  );
}
