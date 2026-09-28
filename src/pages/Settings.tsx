import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle2, XCircle, Mic } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDialer } from '@/contexts/DialerContext';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { WorkspaceSettings } from '@/types/database';

export default function Settings() {
  const { workspace, workspaceId, user } = useAuth();
  const dialer = useDialer();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['workspace_settings', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceSettings | null;
    },
  });

  const [form, setForm] = useState<Partial<WorkspaceSettings>>({});
  const [workspaceName, setWorkspaceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (workspace) setWorkspaceName(workspace.name);
  }, [workspace]);

  function set<K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveWorkspaceName() {
    if (!workspaceId) return;
    await supabase.from('workspaces').update({ name: workspaceName }).eq('id', workspaceId);
    toast('Workspace name updated.', { variant: 'success' });
  }

  async function saveTwilioSettings() {
    if (!workspaceId) return;
    setSaving(true);
    const { error } = await supabase.from('workspace_settings').upsert({
      workspace_id: workspaceId,
      twilio_account_sid: form.twilio_account_sid || null,
      twilio_auth_token: form.twilio_auth_token || null,
      twilio_api_key: form.twilio_api_key || null,
      twilio_api_secret: form.twilio_api_secret || null,
      twilio_twiml_app_sid: form.twilio_twiml_app_sid || null,
      twilio_caller_number: form.twilio_caller_number || null,
    });
    setSaving(false);
    if (error) {
      toast(`Could not save: ${error.message}`, { variant: 'error' });
      return;
    }
    toast('Twilio settings saved. Reload the app for the dialer to pick up new credentials.', { variant: 'success' });
    queryClient.invalidateQueries({ queryKey: ['workspace_settings'] });
  }

  async function testCredentials() {
    if (!form.twilio_account_sid || !form.twilio_auth_token) {
      toast('Enter Account SID and Auth Token first.', { variant: 'error' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke('test-twilio-credentials', {
      body: {
        account_sid: form.twilio_account_sid,
        auth_token: form.twilio_auth_token,
        caller_number: form.twilio_caller_number,
      },
    });
    setTesting(false);
    if (error || !data?.ok) {
      setTestResult({ ok: false, message: data?.error ?? error?.message ?? 'Verification failed' });
      return;
    }
    setTestResult({
      ok: true,
      message: `Connected to "${data.friendlyName}" (${data.accountStatus})${
        form.twilio_caller_number ? (data.numberOwned ? ' — number verified.' : ' — that number is not on this account.') : ''
      }`,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Workspace name</Label>
              <div className="flex gap-2">
                <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
                <Button onClick={saveWorkspaceName}>Save</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Twilio configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-text-tertiary">
              Find these in your Twilio Console. The Voice SDK uses an API Key/Secret + a TwiML App (not your master Auth
              Token) to authorize the browser dialer — see the README for how to create each one.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Account SID</Label>
                <Input value={form.twilio_account_sid ?? ''} onChange={(e) => set('twilio_account_sid', e.target.value)} className="mono-num" />
              </div>
              <div className="space-y-1">
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  value={form.twilio_auth_token ?? ''}
                  onChange={(e) => set('twilio_auth_token', e.target.value)}
                  className="mono-num"
                />
              </div>
              <div className="space-y-1">
                <Label>API Key SID</Label>
                <Input value={form.twilio_api_key ?? ''} onChange={(e) => set('twilio_api_key', e.target.value)} className="mono-num" />
              </div>
              <div className="space-y-1">
                <Label>API Key Secret</Label>
                <Input
                  type="password"
                  value={form.twilio_api_secret ?? ''}
                  onChange={(e) => set('twilio_api_secret', e.target.value)}
                  className="mono-num"
                />
              </div>
              <div className="space-y-1">
                <Label>TwiML App SID</Label>
                <Input
                  value={form.twilio_twiml_app_sid ?? ''}
                  onChange={(e) => set('twilio_twiml_app_sid', e.target.value)}
                  className="mono-num"
                />
              </div>
              <div className="space-y-1">
                <Label>Caller ID number</Label>
                <Input
                  placeholder="+15551234567"
                  value={form.twilio_caller_number ?? ''}
                  onChange={(e) => set('twilio_caller_number', e.target.value)}
                  className="mono-num"
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-2 rounded border p-2 text-xs ${
                  testResult.ok ? 'border-accent/30 bg-accent/10 text-accent' : 'border-danger/30 bg-danger/10 text-danger'
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={testCredentials} disabled={testing}>
                {testing ? 'Testing…' : 'Test credentials'}
              </Button>
              <Button onClick={saveTwilioSettings} disabled={saving}>
                <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Twilio settings'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Microphone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-text-tertiary">
              Pick which input device the dialer uses. Bluetooth headsets connected after the page loaded won't be picked
              up automatically — refresh this list or select them here.
            </p>
            <div className="flex gap-2">
              <Select value={dialer.selectedInputDeviceId ?? undefined} onValueChange={dialer.setInputDevice}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Default microphone" />
                </SelectTrigger>
                <SelectContent>
                  {dialer.inputDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone (${d.deviceId.slice(0, 6)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={dialer.refreshDevices}>
                <Mic className="h-3.5 w-3.5" /> Refresh devices
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
