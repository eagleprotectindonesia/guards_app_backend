'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import { GaugeCard } from './gauge-card';

type Props = {
  scheduled: number;
  checkedIn: number;
  missedCheckIn: number;
};

export function CheckInPerformanceCard({ scheduled, checkedIn, missedCheckIn }: Props) {
  return (
    <GaugeCard
      icon={BarChart3}
      title="Check-in Performance"
      subtitle="Check-in Rate"
      expected={scheduled}
      completed={checkedIn}
      missed={missedCheckIn}
      color="emerald"
    />
  );
}
