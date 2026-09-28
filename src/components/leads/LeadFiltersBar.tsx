import React, { useState } from 'react';
import { Search, Bookmark, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { LeadFilters, LeadOutcome, LeadStatus, SavedFilter } from '@/types/database';
import { OUTCOME_LABELS, STATUS_LABELS } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLeadFilters } from '@/hooks/useLeadFilters';
import { useToast } from '@/components/ui/toast';

export function LeadFiltersBar({
  filters,
  onChange,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
}) {
  const { workspaceId, user } = useAuth();
  const { toast } = useToast();
  const { savePreset, loadPresets, deletePreset } = useLeadFilters();
  const [presets, setPresets] = useState<SavedFilter[]>(loadPresets());
  const [presetName, setPresetName] = useState('');

  function update(patch: Partial<LeadFilters>) {
    onChange({ ...filters, ...patch });
  }

  const activeCount = [
    filters.search,
    filters.status?.length,
    filters.outcome?.length,
    filters.city,
    filters.state,
    filters.lastCalledBefore,
    filters.lastCalledAfter,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
      <div className="relative w-64">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
        <Input
          className="pl-7"
          placeholder="Search business, phone, city, address…"
          value={filters.search ?? ''}
          onChange={(e) => update({ search: e.target.value })}
        />
      </div>

      <Select
        value={filters.status?.[0] ?? 'all'}
        onValueChange={(v) => update({ status: v === 'all' ? undefined : [v as LeadStatus] })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(STATUS_LABELS).map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.outcome?.[0] ?? 'all'}
        onValueChange={(v) => update({ outcome: v === 'all' ? undefined : [v as LeadOutcome] })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Outcome" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All outcomes</SelectItem>
          {Object.entries(OUTCOME_LABELS).map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="w-32"
        placeholder="City"
        value={filters.city ?? ''}
        onChange={(e) => update({ city: e.target.value || undefined })}
      />
      <Input
        className="w-20"
        placeholder="State"
        maxLength={2}
        value={filters.state ?? ''}
        onChange={(e) => update({ state: e.target.value.toUpperCase() || undefined })}
      />

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <X className="h-3 w-3" /> Clear ({activeCount})
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Bookmark className="h-3.5 w-3.5" /> Presets
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <Input
                  placeholder="Preset name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="text-xs"
                />
                <Button
                  size="sm"
                  disabled={!presetName || !workspaceId || !user}
                  onClick={() => {
                    if (!workspaceId || !user) return;
                    setPresets(savePreset(presetName, workspaceId, user.id));
                    setPresetName('');
                    toast('Filter preset saved.', { variant: 'success' });
                  }}
                >
                  Save
                </Button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {presets.length === 0 && <p className="text-xs text-text-tertiary">No saved presets yet.</p>}
                {presets.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-surface-hover">
                    <button className="text-xs text-text-primary" onClick={() => onChange(p.filter_json)}>
                      {p.name}
                    </button>
                    <button
                      className="text-text-tertiary hover:text-danger"
                      onClick={() => setPresets(deletePreset(p.id))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
