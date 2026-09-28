import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Inbox, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useLeadListsQuery } from '@/hooks/useLeadListsQuery';
import { cn } from '@/lib/utils';
import type { LeadFilters } from '@/types/database';

// A small fixed palette so each section gets a stable-looking color dot
// derived from its id, without needing to manage color pickers.
const DOT_COLORS = ['bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-fuchsia-400', 'bg-rose-400', 'bg-violet-400', 'bg-cyan-400', 'bg-lime-400'];
function dotColorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_COLORS[hash % DOT_COLORS.length];
}

export function LeadListsSidebar({
  workspaceId,
  totalLeads,
  filters,
  onChange,
}: {
  workspaceId: string;
  totalLeads: number;
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useLeadListsQuery(workspaceId);
  const lists = data?.lists ?? [];
  const unassignedCount = data?.unassignedCount ?? 0;

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['lead_lists', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  function isActive(predicate: (f: LeadFilters) => boolean) {
    return predicate(filters);
  }

  const activeAll = !filters.listId && !filters.unassignedOnly;
  const activeUnassigned = !!filters.unassignedOnly;

  async function createList() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const { data: row, error } = await supabase
      .from('lead_lists')
      .insert({ workspace_id: workspaceId, name })
      .select('id')
      .single();
    if (error) {
      toast(`Could not create section: ${error.message}`, { variant: 'error' });
      return;
    }
    setNewName('');
    setCreating(false);
    invalidate();
    onChange({ ...filters, listId: row.id, unassignedOnly: undefined });
  }

  async function renameList(id: string) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    const { error } = await supabase.from('lead_lists').update({ name }).eq('id', id);
    if (error) {
      toast(`Could not rename: ${error.message}`, { variant: 'error' });
      return;
    }
    invalidate();
  }

  async function deleteList(id: string, name: string) {
    if (!window.confirm(`Delete section "${name}"? Its leads aren't deleted — they'll just show up under "No section".`)) return;
    const { error } = await supabase.from('lead_lists').delete().eq('id', id);
    if (error) {
      toast(`Could not delete: ${error.message}`, { variant: 'error' });
      return;
    }
    if (filters.listId === id) onChange({ ...filters, listId: undefined });
    invalidate();
  }

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-border bg-surface-raised/40 py-3">
      <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Sections</p>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-1.5">
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover',
            activeAll ? 'bg-surface-hover text-text-primary font-medium' : 'text-text-secondary'
          )}
          onClick={() => onChange({ ...filters, listId: undefined, unassignedOnly: undefined })}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">All leads</span>
          <span className="mono-num text-xs text-text-tertiary">{totalLeads}</span>
        </button>

        {lists.map((l) => (
          <div
            key={l.id}
            className={cn(
              'group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-hover',
              isActive((f) => f.listId === l.id) ? 'bg-surface-hover text-text-primary font-medium' : 'text-text-secondary'
            )}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColorFor(l.id))} />
            {editingId === l.id ? (
              <input
                autoFocus
                className="h-6 flex-1 min-w-0 rounded border border-accent bg-surface-raised px-1 text-sm text-text-primary outline-none"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => renameList(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameList(l.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button
                className="min-w-0 flex-1 truncate text-left"
                title={l.name}
                onClick={() => onChange({ ...filters, listId: l.id, unassignedOnly: undefined })}
              >
                {l.name}
              </button>
            )}
            <span className="mono-num text-xs text-text-tertiary">{l.lead_count ?? 0}</span>
            <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button
                className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                title="Rename"
                onClick={() => {
                  setEditingId(l.id);
                  setEditingName(l.name);
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                className="rounded p-0.5 text-text-tertiary hover:text-danger"
                title="Delete"
                onClick={() => deleteList(l.id, l.name)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {!isLoading && lists.length === 0 && !creating && (
          <p className="px-2 py-1 text-xs text-text-tertiary">No sections yet — group leads by campaign, source, or voice agent.</p>
        )}

        <button
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover',
            activeUnassigned ? 'bg-surface-hover text-text-primary font-medium' : 'text-text-tertiary'
          )}
          onClick={() => onChange({ ...filters, unassignedOnly: true, listId: undefined })}
        >
          <Inbox className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">No section</span>
          <span className="mono-num text-xs text-text-tertiary">{unassignedCount}</span>
        </button>
      </div>

      <div className="border-t border-border px-1.5 pt-2">
        {creating ? (
          <input
            autoFocus
            className="h-7 w-full rounded border border-accent bg-surface-raised px-2 text-sm text-text-primary outline-none"
            placeholder="Section name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={createList}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createList();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
          />
        ) : (
          <button
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" /> New section
          </button>
        )}
      </div>
    </div>
  );
}
