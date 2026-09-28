import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isFuture } from 'date-fns';
import { MessageSquarePlus, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/AuthContext';
import type { LeadConversationEntry } from '@/types/database';

/** A running, timestamped conversation history for a single lead — every
 * entry is appended, never overwritten, so the full history of what was
 * said across calls/emails/touchpoints stays visible. Each entry can also
 * carry an optional follow-up date/time, so you can note when to call the
 * lead back right when you're logging what happened. Shared between the
 * Lead detail dialog and the Session Dialer's call queue view, so notes
 * added in one place show up in the other. */
export function ConversationLog({ leadId }: { leadId: string }) {
  const { workspaceId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const queryKey = ['lead_conversation_entries', leadId];

  const { data: entries, isLoading } = useQuery({
    queryKey,
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_conversation_entries')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as LeadConversationEntry[];
    },
  });

  async function addEntry() {
    const body = draft.trim();
    if (!body || !workspaceId) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from('lead_conversation_entries').insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      body,
      follow_up_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast(`Could not save conversation note: ${error.message}`, { variant: 'error' });
      return;
    }
    setDraft('');
    setFollowUpDraft('');
    queryClient.invalidateQueries({ queryKey });
  }

  // Earliest upcoming follow-up across all entries, so it's easy to spot
  // "when am I supposed to call this lead back" without scanning the log.
  const upcomingFollowUps = (entries ?? [])
    .filter((e) => e.follow_up_at && isFuture(new Date(e.follow_up_at)))
    .sort((a, b) => new Date(a.follow_up_at!).getTime() - new Date(b.follow_up_at!).getTime());
  const nextFollowUp = upcomingFollowUps[0];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Conversation log</p>

      {nextFollowUp && (
        <div className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs text-accent">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Follow up {format(new Date(nextFollowUp.follow_up_at!), 'MMM d, yyyy · h:mm a')}
        </div>
      )}

      <div className="space-y-1.5">
        <Textarea
          rows={2}
          placeholder="Log what happened on this call or email…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[10px] normal-case text-text-tertiary">Call back at (optional)</Label>
            <Input
              type="datetime-local"
              value={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.value)}
              className="mono-num"
            />
          </div>
          <Button onClick={addEntry} disabled={saving || !draft.trim()} title="Add entry (⌘+Enter)">
            <MessageSquarePlus className="h-3.5 w-3.5" /> Log
          </Button>
        </div>
      </div>

      <div className="max-h-48 space-y-2 overflow-y-auto">
        {isLoading && <p className="text-xs text-text-tertiary">Loading…</p>}
        {!isLoading && (!entries || entries.length === 0) && (
          <p className="text-xs text-text-tertiary">No conversation logged yet.</p>
        )}
        {entries?.map((entry) => (
          <div key={entry.id} className="rounded border border-border bg-surface-hover p-2">
            <p className="text-xs text-text-primary whitespace-pre-wrap">{entry.body}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[10px] text-text-tertiary">{format(new Date(entry.created_at), 'MMM d, yyyy · h:mm a')}</p>
              {entry.follow_up_at && (
                <p className="flex items-center gap-1 text-[10px] font-medium text-accent">
                  <CalendarClock className="h-3 w-3" />
                  {format(new Date(entry.follow_up_at), 'MMM d, h:mm a')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
