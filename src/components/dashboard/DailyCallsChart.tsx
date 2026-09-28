import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface DayStat {
  day: string;
  total_calls: number;
  unique_leads_touched: number;
  connected_calls: number;
}

export function DailyCallsChart({ data }: { data: DayStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#22262F" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={(d) => format(new Date(d), 'MMM d')}
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={{ stroke: '#22262F' }}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(34,197,94,0.06)' }}
          contentStyle={{
            background: '#1A1D24',
            border: '1px solid #2E333F',
            borderRadius: 6,
            fontSize: 12,
            color: '#E5E7EB',
          }}
          labelFormatter={(d) => format(new Date(d as string), 'EEEE, MMM d')}
        />
        <Bar dataKey="total_calls" name="Calls" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
