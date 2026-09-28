import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { useNavigate } from 'react-router-dom';
import type { LeadFilters } from '@/types/database';

export function CreateSessionDialog({
  open,
  onOpenChange,
  workspaceId,
  leadIds,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  leadIds: string[];
  filters?: LeadFilters;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!name.trim()) {
      toast('Give the session a name.', { variant: 'error' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc('create_session_from_leads', {
      p_workspace_id: workspaceId,
      p_name: name,
      p_lead_ids: leadIds,
      p_filter_json: filters ?? {},
    });
    setCreating(false);
    if (error) {
      toast(`Could not create session: ${error.message}`, { variant: 'error' });
      return;
    }
    toast('Session created.', { variant: 'success' });
    onOpenChange(false);
    setName('');
    navigate(`/sessions/${data}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New calling session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <div className="space-y-1">
            <Label>Session name</Label>
            <Input
              autoFocus
              placeholder="e.g. Austin dentists — round 2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <p className="text-xs text-text-tertiary">
            {leadIds.length.toLocaleString()} lead{leadIds.length === 1 ? '' : 's'} selected. Duplicate phone numbers
            will be collapsed to one entry per session automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={creating || leadIds.length === 0}>
            {creating ? 'Creating…' : 'Create & open dialer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
