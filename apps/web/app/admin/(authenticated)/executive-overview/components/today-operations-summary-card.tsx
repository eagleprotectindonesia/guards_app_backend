import React from 'react';
import { ShieldCheck, Building2, MapPin, Clock } from 'lucide-react';
import { MetricListCard } from './metric-list-card';

type Props = {
  guardsOnDuty: number;
  activeSites: number;
  totalCheckins: number;
  lateGuards: number;
};

export function TodayOperationsSummaryCard({ guardsOnDuty, activeSites, totalCheckins, lateGuards }: Props) {
  return (
    <MetricListCard
      icon={ShieldCheck}
      iconAccent="sky"
      title="Today's Operations Summary"
      subtitle="Operational overview"
      rows={[
        { icon: ShieldCheck, label: 'Guards On Duty', sublabel: 'Active now', value: guardsOnDuty, accent: 'sky' },
        { icon: Building2, label: 'Active Sites', sublabel: 'Online', value: activeSites, accent: 'purple' },
        { icon: MapPin, label: 'Total Check-ins', sublabel: 'Today', value: totalCheckins, accent: 'sky' },
        { icon: Clock, label: 'Late Guards', sublabel: 'Late on-site', value: lateGuards, accent: 'amber' },
      ]}
    />
  );
}
