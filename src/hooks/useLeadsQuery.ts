import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadFilters } from '@/types/database';

const PAGE_SIZE = 50;

export function useLeadsQuery(workspaceId: string | null, filters: LeadFilters, page: number, sortBy: string) {
  return useQuery({
    queryKey: ['leads', workspaceId, filters, page, sortBy],
    enabled: !!workspaceId,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*, list:lead_lists(id, name, color)', { count: 'exact' })
        .eq('workspace_id', workspaceId!);

      if (filters.listId) query = query.eq('list_id', filters.listId);
      if (filters.unassignedOnly) query = query.is('list_id', null);
      if (filters.search) {
        const term = filters.search.replace(/[%,]/g, '');
        query = query.or(
          `business_name.ilike.%${term}%,phone.ilike.%${term}%,city.ilike.%${term}%,address.ilike.%${term}%`
        );
      }
      if (filters.status?.length) query = query.in('status', filters.status);
      if (filters.outcome?.length) query = query.in('outcome', filters.outcome);
      if (filters.city) query = query.ilike('city', `%${filters.city}%`);
      if (filters.state) query = query.eq('state', filters.state);
      if (filters.lastCalledBefore) query = query.lte('last_called_at', filters.lastCalledBefore);
      if (filters.lastCalledAfter) query = query.gte('last_called_at', filters.lastCalledAfter);

      const [sortCol, sortDir] = sortBy.split(':');
      query = query.order(sortCol, { ascending: sortDir === 'asc', nullsFirst: false });

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { leads: (data as Lead[]) ?? [], total: count ?? 0, pageSize: PAGE_SIZE };
    },
  });
}

export { PAGE_SIZE };
