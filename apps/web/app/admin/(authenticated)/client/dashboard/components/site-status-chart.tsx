'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

type SiteStatusChartProps = {
  activeSites: number;
  inactiveSites: number;
};

export default function SiteStatusChart({ activeSites, inactiveSites }: SiteStatusChartProps) {
  const data = [
    { name: 'Active Sites', value: activeSites, color: '#10b981' },   // emerald-500
    { name: 'Inactive Sites', value: inactiveSites, color: '#ef4444' }, // rose-500
  ];

  const total = activeSites + inactiveSites;

  return (
    <div className="h-64 w-full flex flex-col items-center justify-center relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={5}
            dataKey="value"
            isAnimationActive={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1b2130',
              borderColor: '#2f374c',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '11px',
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center Text */}
      <div className="absolute top-[37%] flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-extrabold text-foreground">{total}</span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Sites</span>
      </div>
    </div>
  );
}
