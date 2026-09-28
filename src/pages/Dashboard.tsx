import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PhoneCall, Users, TrendingUp, RefreshCw, CalendarDays, CalendarRange } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth, subDays, formatISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { DailyCallsChart } from '@/components/dashboard/DailyCallsChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const CONNECTED_OUTCOMES = ['connected_dm', 'connected_gk', 'connected_other', 'appointment_set', 'callback_requested'];

export default function Dashboard() {
  const { workspaceId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['dashboard_kpis', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const now = new Date();
      const ranges = {
        today: startOfDay(now),
        week: startOfWeek(now, { weekStartsOn: 1 }),
        month: startOfMonth(now),
      };

      async function statsSince(since: Date) {
        const { data, error } = await supabase
          .from('dial_call_logs')
          .select('lead_id, outcome')
          .eq('workspace_id', workspaceId!)
          .gte('called_at', since.toISOString());
        if (error) throw error;
        const total = data.length;
        const uniqueLeads = new Set(data.map((d) => d.lead_id).filter(Boolean)).size;
        const connected = data.filter((d) => d.outcome && CONNECTED_OUTCOMES.includes(d.outcome)).length;
        return { total, uniqueLeads, connectionRate: total > 0 ? Math.round((connected / total) * 100) : 0 };
      }

      const [today, week, month] = await Promise.all([
        statsSince(ranges.today),
        statsSince(ranges.week),
        statsSince(ranges.month),
      ]);

      return { today, week, month };
    },
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard_chart', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const since = formatISO(subDays(new Date(), 13), { representation: 'date' });
      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        p_workspace_id: workspaceId,
        p_since: since,
      });
      if (error) throw error;
      return data as { day: string; total_calls: number; unique_leads_touched: number; connected_calls: number }[];
    },
  });

  async function refresh() {
    await supabase.rpc('refresh_dashboard_stats');
    queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_chart'] });
    toast('Dashboard refreshed.', { variant: 'success' });
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Dashboard"
        actions={
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Today</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Calls" value={kpis?.today.total ?? (isLoading ? '—' : 0)} icon={PhoneCall} accent />
            <StatCard label="Unique leads" value={kpis?.today.uniqueLeads ?? 0} icon={Users} />
            <StatCard label="Connect rate" value={`${kpis?.today.connectionRate ?? 0}%`} icon={TrendingUp} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              <CalendarDays className="h-3 w-3" /> This week
            </p>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Calls" value={kpis?.week.total ?? 0} icon={PhoneCall} />
              <StatCard label="Unique leads" value={kpis?.week.uniqueLeads ?? 0} icon={Users} />
              <StatCard label="Connect rate" value={`${kpis?.week.connectionRate ?? 0}%`} icon={TrendingUp} />
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              <CalendarRange className="h-3 w-3" /> This month
            </p>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Calls" value={kpis?.month.total ?? 0} icon={PhoneCall} />
              <StatCard label="Unique leads" value={kpis?.month.uniqueLeads ?? 0} icon={Users} />
              <StatCard label="Connect rate" value={`${kpis?.month.connectionRate ?? 0}%`} icon={TrendingUp} />
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calls — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData && chartData.length > 0 ? (
              <DailyCallsChart data={chartData} />
            ) : (
              <p className="py-10 text-center text-xs text-text-tertiary">
                No call data yet — dashboard_daily_stats refreshes hourly, or click Refresh above right after a session.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
