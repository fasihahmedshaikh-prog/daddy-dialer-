import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LeadList } from '@/types/database';

/** Lists ("sections") for the current workspace, each carrying its lead
 * count, plus the count of leads with no list assigned yet ("No section").
 * Powers the sidebar on the Leads page. */
export function useLeadListsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['lead_lists', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const [listsRes, unassignedRes] = await Promise.all([
        supabase.rpc('get_lead_lists_with_counts', { p_workspace_id: workspaceId }),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId!)
          .is('list_id', null),
      ]);

      if (listsRes.error) throw listsRes.error;
      if (unassignedRes.error) throw unassignedRes.error;

      return {
        lists: (listsRes.data ?? []) as LeadList[],
        unassignedCount: unassignedRes.count ?? 0,
      };
    },
  });
}
