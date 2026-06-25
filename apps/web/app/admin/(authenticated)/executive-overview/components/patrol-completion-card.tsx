'use client';

import React from 'react';
import { Route } from 'lucide-react';
import { GaugeCard } from './gauge-card';

type Props = {
  expected: number;
  completed: number;
  missed: number;
};

export function PatrolCompletionCard({ expected, completed, missed }: Props) {
  return (
    <GaugeCard
      icon={Route}
      title="Patrol Completion"
      subtitle="Completion Rate"
      expected={expected}
      completed={completed}
      missed={missed}
      color="purple"
    />
  );
}
