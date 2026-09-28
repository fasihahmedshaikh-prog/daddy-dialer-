import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SESSION_STATUS_LABELS, cn } from '@/lib/utils';
import type { CallingSession } from '@/types/database';
import { format } from 'date-fns';
import { Play } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-text-secondary border-border-strong',
  active: 'text-accent border-accent/40',
  paused: 'text-warning border-warning/40',
  completed: 'text-info border-info/40',
};

export default function Sessions() {
  const { workspaceId } = useAuth();
  const navigate = useNavigate();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calling_sessions')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CallingSession[];
    },
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sessions"
        description="Create sessions from the Leads page, then work them here."
      />
      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-text-tertiary">
                  Loading sessions…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (sessions?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-text-tertiary">
                  No sessions yet — build one from the Leads page.
                </TableCell>
              </TableRow>
            )}
            {sessions?.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/sessions/${s.id}`)}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge className={cn(STATUS_COLOR[s.status])}>{SESSION_STATUS_LABELS[s.status]}</Badge>
                </TableCell>
                <TableCell className="mono-num text-text-secondary">
                  {s.completed_leads} / {s.total_leads}
                </TableCell>
                <TableCell className="text-text-secondary">{format(new Date(s.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/sessions/${s.id}`)}>
                    <Play className="h-3 w-3" /> Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
