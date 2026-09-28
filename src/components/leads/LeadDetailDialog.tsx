import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import type { Lead, LeadStatus } from '@/types/database';
import { STATUS_LABELS, normalizePhone } from '@/lib/utils';
import { Phone } from 'lucide-react';
import { useDialer } from '@/contexts/DialerContext';
import { ConversationLog, type ConversationLogHandle } from './ConversationLog';

export function LeadDetailDialog({
  lead,
  onOpenChange,
  onSaved,
}: {
  lead: Lead | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const dialer = useDialer();
  const [form, setForm] = useState<Partial<Lead>>({});
  const [saving, setSaving] = useState(false);
  const conversationLogRef = useRef<ConversationLogHandle>(null);

  useEffect(() => {
    if (lead) setForm(lead);
  }, [lead]);

  if (!lead) return null;
  const currentLead = lead;

  function set<K extends keyof Lead>(key: K, value: Lead[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    // Save any conversation note left unlogged before persisting the rest
    // of the lead edits, so closing this dialog never drops a typed note.
    await conversationLogRef.current?.flush();
    const { error } = await supabase
      .from('leads')
      .update({
        business_name: form.business_name,
        phone: normalizePhone(form.phone as string),
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        website: form.website,
        email: form.email,
        notes: form.notes,
        status: form.status,
      })
      .eq('id', currentLead.id);
    setSaving(false);
    if (error) {
      toast(`Could not save: ${error.message}`, { variant: 'error' });
      return;
    }
    toast('Lead updated.', { variant: 'success' });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="space-y-1">
            <Label>Business name</Label>
            <Input value={form.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className="mono-num" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as LeadStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>State</Label>
              <Input value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Zip</Label>
              <Input value={form.zip ?? ''} onChange={(e) => set('zip', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Website</Label>
              <Input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <ConversationLog ref={conversationLogRef} key={currentLead.id} leadId={currentLead.id} />

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => dialer.placeCall(lead.phone, { leadId: lead.id, lead })}>
            <Phone className="h-3.5 w-3.5" /> Call
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
