import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CallingSession, SessionLead } from '@/types/database';

export function useSessionQueue(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from('calling_sessions').select('*').eq('id', sessionId!).single();
      if (error) throw error;
      return data as CallingSession;
    },
  });

  const queueQuery = useQuery({
    queryKey: ['session_leads', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_leads')
        .select('*, lead:leads(*)')
        .eq('session_id', sessionId!)
        .order('queue_order', { ascending: true });
      if (error) throw error;
      return data as SessionLead[];
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['session_leads', sessionId] });
  }, [queryClient, sessionId]);

  const queue = queueQuery.data ?? [];
  const current = queue.find((sl) => sl.status === 'queued') ?? null;
  const remaining = queue.filter((sl) => sl.status === 'queued').length;

  return {
    session: sessionQuery.data,
    queue,
    current,
    remaining,
    loading: sessionQuery.isLoading || queueQuery.isLoading,
    invalidate,
  };
}
