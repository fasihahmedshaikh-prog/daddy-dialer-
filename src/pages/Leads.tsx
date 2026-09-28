import React, { useState } from 'react';
import { Upload, ListPlus, ChevronLeft, ChevronRight, FolderInput } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLeadsQuery, PAGE_SIZE } from '@/hooks/useLeadsQuery';
import { useLeadListsQuery } from '@/hooks/useLeadListsQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { LeadFiltersBar } from '@/components/leads/LeadFiltersBar';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDialog } from '@/components/leads/LeadDetailDialog';
import { ImportLeadsDialog } from '@/components/leads/ImportLeadsDialog';
import { LeadListsSidebar } from '@/components/leads/LeadListsSidebar';
import { CreateSessionDialog } from '@/components/sessions/CreateSessionDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import type { Lead, LeadFilters } from '@/types/database';

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'business_name:asc', label: 'Business name A–Z' },
  { value: 'last_called_at:desc', label: 'Recently called' },
];

export default function Leads() {
  const { workspaceId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<LeadFilters>({});
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('created_at:desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [selectFirstN, setSelectFirstN] = useState('');

  const { data, isLoading } = useLeadsQuery(workspaceId, filters, page, sortBy);
  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // For the "All leads" sidebar count, independent of the current filters.
  const { data: allLeadsData } = useLeadsQuery(workspaceId, {}, 0, sortBy);
  const allLeadsTotal = allLeadsData?.total ?? 0;
  const { data: listsData } = useLeadListsQuery(workspaceId);
  const lists = listsData?.lists ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['lead_lists'] });
  }

  async function moveSelectedToList(listId: string) {
    if (selected.size === 0 || !workspaceId) return;
    const targetId = listId === '__unassigned' ? null : listId;
    const { error } = await supabase.from('leads').update({ list_id: targetId }).in('id', Array.from(selected));
    if (error) {
      toast(`Could not move leads: ${error.message}`, { variant: 'error' });
      return;
    }
    toast(`Moved ${selected.size} lead${selected.size === 1 ? '' : 's'}.`, { variant: 'success' });
    setSelected(new Set());
    invalidate();
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((s) => {
      const allVisibleSelected = leads.every((l) => s.has(l.id));
      const next = new Set(s);
      leads.forEach((l) => (allVisibleSelected ? next.delete(l.id) : next.add(l.id)));
      return next;
    });
  }

  async function selectFirstNMatching() {
    const n = parseInt(selectFirstN, 10);
    if (!n || n <= 0 || !workspaceId) return;
    let query = supabase.from('leads').select('id').eq('workspace_id', workspaceId);
    if (filters.search) {
      const term = filters.search.replace(/[%,]/g, '');
      query = query.or(`business_name.ilike.%${term}%,phone.ilike.%${term}%,city.ilike.%${term}%,address.ilike.%${term}%`);
    }
    if (filters.status?.length) query = query.in('status', filters.status);
    if (filters.outcome?.length) query = query.in('outcome', filters.outcome);
    if (filters.city) query = query.ilike('city', `%${filters.city}%`);
    if (filters.state) query = query.eq('state', filters.state);
    const [sortCol, sortDir] = sortBy.split(':');
    query = query.order(sortCol, { ascending: sortDir === 'asc' }).limit(Math.min(n, 5000));

    const { data, error } = await query;
    if (error) {
      toast(`Could not select: ${error.message}`, { variant: 'error' });
      return;
    }
    setSelected(new Set(data.map((r) => r.id)));
    toast(`Selected ${data.length} lead${data.length === 1 ? '' : 's'}.`, { variant: 'success' });
  }

  const activeListName = filters.listId
    ? lists.find((l) => l.id === filters.listId)?.name
    : filters.unassignedOnly
      ? 'No section'
      : undefined;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Leads"
        description={activeListName ? `${activeListName} · ${total.toLocaleString()} leads` : `${total.toLocaleString()} total`}
        actions={
          <>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {workspaceId && (
          <LeadListsSidebar
            workspaceId={workspaceId}
            totalLeads={allLeadsTotal}
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(0);
            }}
          />
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <LeadFiltersBar
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(0);
            }}
          />

          <div className="flex items-center gap-2 border-b border-border bg-surface-raised/50 px-6 py-2">
            <input
              className="h-7 w-20 rounded border border-border bg-surface-raised px-2 text-xs"
              placeholder="Select first"
              value={selectFirstN}
              onChange={(e) => setSelectFirstN(e.target.value.replace(/\D/g, ''))}
            />
            <Button size="sm" variant="outline" onClick={selectFirstNMatching}>
              Select
            </Button>
            <span className="text-xs text-text-tertiary">{selected.size} selected</span>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
                <Select onValueChange={moveSelectedToList}>
                  <SelectTrigger className="h-7 w-44">
                    <FolderInput className="h-3.5 w-3.5" />
                    <SelectValue placeholder={`Move ${selected.size} to section…`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">No section</SelectItem>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setSessionDialogOpen(true)} className="ml-auto">
                  <ListPlus className="h-3.5 w-3.5" /> Create session from {selected.size}
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <LeadsTable
              leads={leads}
              loading={isLoading}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAllVisible}
              onRowClick={setDetailLead}
            />
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
      </div>

      <LeadDetailDialog lead={detailLead} onOpenChange={(o) => !o && setDetailLead(null)} onSaved={invalidate} />
      {workspaceId && (
        <>
          <ImportLeadsDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            workspaceId={workspaceId}
            lists={lists}
            defaultListId={filters.listId}
            onImported={invalidate}
          />
          <CreateSessionDialog
            open={sessionDialogOpen}
            onOpenChange={setSessionDialogOpen}
            workspaceId={workspaceId}
            leadIds={Array.from(selected)}
            filters={filters}
          />
        </>
      )}
    </div>
  );
}
