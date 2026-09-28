import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronLeft, Play, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatDuration, formatPhoneDisplay, OUTCOME_COLORS, OUTCOME_LABELS, cn } from '@/lib/utils';
import type { DialCallLog, LeadOutcome } from '@/types/database';
import { format } from 'date-fns';

const PAGE_SIZE = 50;

export default function CallLog() {
  const { workspaceId } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['call_logs', workspaceId, page, search],
    enabled: !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from('dial_call_logs')
        .select('*, lead:leads(*), session:calling_sessions(name)', { count: 'exact' })
        .eq('workspace_id', workspaceId!)
        .order('called_at', { ascending: false });

      if (search) {
        const term = search.replace(/[%,]/g, '');
        query = query.ilike('to_number', `%${term}%`);
      }

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: (data as DialCallLog[]) ?? [], total: count ?? 0 };
    },
  });

  async function updateOutcome(logId: string, outcome: LeadOutcome) {
    await supabase.from('dial_call_logs').update({ outcome }).eq('id', logId);
    queryClient.invalidateQueries({ queryKey: ['call_logs'] });
  }

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Call Log" description={`${total.toLocaleString()} calls`} />

      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-7" placeholder="Search phone number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Recording</TableHead>
              <TableHead>Called at</TableHead>
              <TableHead>Session</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-text-tertiary">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                  <TableCell>
                    {expandedId === log.id ? (
                      <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{log.lead?.business_name ?? '—'}</TableCell>
                  <TableCell className="mono-num">{formatPhoneDisplay(log.to_number)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={log.outcome ?? undefined} onValueChange={(v) => updateOutcome(log.id, v as LeadOutcome)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Set outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(OUTCOME_LABELS).map(([k, l]) => (
                          <SelectItem key={k} value={k}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="mono-num text-text-secondary">{formatDuration(log.duration_seconds)}</TableCell>
                  <TableCell>
                    {log.recording_url ? (
                      <a href={log.recording_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost">
                          <Play className="h-3.5 w-3.5 text-accent" />
                        </Button>
                      </a>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-text-secondary">{format(new Date(log.called_at), 'MMM d, h:mm a')}</TableCell>
                  <TableCell className="text-text-secondary">{log.session?.name ?? '—'}</TableCell>
                </TableRow>
                {expandedId === log.id && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-surface-hover/50">
                      <div className="space-y-3 py-2">
                        {log.recording_url && (
                          <audio controls src={log.recording_url} className="h-8 w-full max-w-md" />
                        )}
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">Transcript</p>
                          <p className="text-xs text-text-secondary">
                            {log.transcript?.transcript_text ??
                              'No transcript available yet — plug a transcription provider into the twilio-recording-callback edge function to populate this automatically.'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-2">
        <span className="text-xs text-text-tertiary">
          Page {page + 1} of {totalPages}
        </span>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
