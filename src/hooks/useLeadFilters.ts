import { useCallback, useState } from 'react';
import type { LeadFilters, SavedFilter } from '@/types/database';

const STORAGE_KEY = 'daddy_dialer_saved_filter_presets';

export function useLeadFilters() {
  const [filters, setFilters] = useState<LeadFilters>({});

  const loadPresets = useCallback((): SavedFilter[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const savePreset = useCallback(
    (name: string, workspaceId: string, userId: string) => {
      const presets = loadPresets();
      const preset: SavedFilter = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        name,
        filter_json: filters,
        created_at: new Date().toISOString(),
      };
      const next = [...presets.filter((p) => p.name !== name), preset];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    },
    [filters, loadPresets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      const next = loadPresets().filter((p) => p.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    },
    [loadPresets]
  );

  return { filters, setFilters, loadPresets, savePreset, deletePreset };
}
