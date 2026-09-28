import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Square, SkipForward, PhoneCall, Star } from 'lucide-react';
import { useSessionQueue } from '@/hooks/useSessionQueue';
import { useDialer } from '@/contexts/DialerContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DispositionBar } from '@/components/sessions/DispositionBar';
import { ConversationLog, type ConversationLogHandle } from '@/components/leads/ConversationLog';
import { CallStatePill } from '@/components/dialer/CallStatePill';
import { formatPhoneDisplay, formatDuration, SESSION_STATUS_LABELS } from '@/lib/utils';
import type { DialCallLog, LeadOutcome } from '@/types/database';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

export default function SessionDialer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useAuth();
  const { toast } = useToast();
  const dialer = useDialer();
  const { session, current, remaining, queue, invalidate, loading } = useSessionQueue(sessionId);
  const [autoDialing, setAutoDialing] = useState(false);
  const conversationLogRef = useRef<ConversationLogHandle>(null);

  const isDialingCurrent =
    dialer.activeCall?.sessionId === sessionId && dialer.activeCall?.leadId === current?.lead_id;

  const { data: history } = useQuery({
    queryKey: ['lead_call_history', current?.lead_id],
    enabled: !!current?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dial_call_logs')
        .select('*')
        .eq('lead_id', current!.lead_id)
        .order('called_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as DialCallLog[];
    },
  });

  async function startSession() {
    if (!sessionId) return;
    await supabase
      .from('calling_sessions')
      .update({ status: 'active', started_at: session?.started_at ?? new Date().toISOString() })
      .eq('id', sessionId);
    setAutoDialing(true);
    invalidate();
  }

  async function pauseSession() {
    if (!sessionId) return;
    setAutoDialing(false);
    await supabase.from('calling_sessions').update({ status: 'paused' }).eq('id', sessionId);
    invalidate();
  }

  async function stopSession() {
    if (!sessionId) return;
    setAutoDialing(false);
    dialer.hangup();
    await supabase
      .from('calling_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', sessionId);
    invalidate();
    toast('Session ended.', { variant: 'info' });
  }

  // Auto-dial the current queue lead whenever we're in "active/auto" mode
  // and nothing is currently ringing/live.
  useEffect(() => {
    if (!autoDialing || !current || dialer.callState !== 'idle') return;
    const t = setTimeout(() => {
      dialer.placeCall(current.lead!.phone, {
        leadId: current.lead_id,
        sessionId,
        lead: current.lead,
      });
      supabase.from('session_leads').update({ status: 'dialing', dialed_at: new Date().toISOString() }).eq('id', current.id);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDialing, current?.id, dialer.callState]);

  async function commitDisposition(outcome: LeadOutcome) {
    if (!current || !workspaceId) return;

    // Save any conversation note the caller typed but never explicitly hit
    // "Log" for, so dispositioning the call doesn't silently drop it.
    await conversationLogRef.current?.flush();

    dialer.hangup();

    const ended = dialer.lastEndedCall;
    if (ended?.callSid) {
      await supabase.from('dial_call_logs').update({ outcome }).eq('twilio_call_sid', ended.callSid);
    } else {
      // Never actually connected (or dispositioned without dialing) — log it manually.
      await supabase.from('dial_call_logs').insert({
        workspace_id: workspaceId,
        lead_id: current.lead_id,
        session_id: sessionId,
        to_number: current.lead!.phone,
        call_state: 'completed',
        outcome,
        called_at: new Date().toISOString(),
      });
    }
    dialer.clearLastEndedCall();

    const newStatus = outcome === 'appointment_set' || outcome === 'not_interested' || outcome === 'do_not_call' ? 'completed' : 'in_progress';
    await supabase
      .from('leads')
      .update({ outcome, status: newStatus, last_called_at: new Date().toISOString() })
      .eq('id', current.lead_id);

    await supabase.from('session_leads').update({ status: 'done' }).eq('id', current.id);

    invalidate();
    toast(`Logged: ${outcome.replace(/_/g, ' ')}`, { variant: 'success' });
  }

  async function skipCurrent() {
    if (!current) return;
    await conversationLogRef.current?.flush();
    dialer.hangup();
    await supabase.from('session_leads').update({ status: 'skipped' }).eq('id', current.id);
    invalidate();
  }

  if (loading || !session) {
    return <div className="p-6 text-sm text-text-tertiary">Loading session…</div>;
  }

  const lead = current?.lead;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={session.name}
        description={`${SESSION_STATUS_LABELS[session.status]} · ${session.completed_leads}/${session.total_leads} worked`}
        actions={
          <>
            {session.status !== 'active' ? (
              <Button onClick={startSession} disabled={!current}>
                <Play className="h-3.5 w-3.5" /> {session.status === 'paused' ? 'Resume' : 'Start'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={pauseSession}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            <Button variant="destructive" onClick={stopSession}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {!current ? (
          <Card>
            <CardContent className="py-12 text-center text-text-secondary">
              Every lead in this session has been worked or skipped. 🎉
              <div className="mt-4">
                <Button variant="secondary" onClick={() => navigate('/sessions')}>
                  Back to Sessions
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{lead?.business_name}</h2>
                    <p className="mono-num text-sm text-text-secondary">{formatPhoneDisplay(lead?.phone)}</p>
                    <p className="text-xs text-text-tertiary">
                      {[lead?.address, lead?.city, lead?.state, lead?.zip].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <CallStatePill state={isDialingCurrent ? dialer.callState : 'idle'} />
                </div>

                {lead?.notes && (
                  <div className="rounded border border-border bg-surface-hover p-2 text-xs text-text-secondary">
                    {lead.notes}
                  </div>
                )}

                <ConversationLog ref={conversationLogRef} key={current.lead_id} leadId={current.lead_id} />

                <div className="flex items-center gap-2">
                  <Button
                    disabled={isDialingCurrent}
                    onClick={() => {
                      setAutoDialing(false);
                      dialer.placeCall(lead!.phone, { leadId: current.lead_id, sessionId, lead });
                      supabase
                        .from('session_leads')
                        .update({ status: 'dialing', dialed_at: new Date().toISOString() })
                        .eq('id', current.id);
                    }}
                  >
                    <PhoneCall className="h-3.5 w-3.5" /> Call now
                  </Button>
                  {isDialingCurrent && dialer.durationSeconds > 0 && (
                    <span className="mono-num text-sm text-text-secondary">{formatDuration(dialer.durationSeconds)}</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={skipCurrent} className="ml-auto">
                    <SkipForward className="h-3.5 w-3.5" /> Skip
                  </Button>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">Log outcome</p>
                  <DispositionBar onSelect={commitDisposition} />
                </div>
              </CardContent>
            </Card>

            {history && history.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Previous calls</p>
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{format(new Date(h.called_at), 'MMM d, h:mm a')}</span>
                      <span className="text-text-primary">{h.outcome?.replace(/_/g, ' ') ?? h.call_state}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <p className="text-center text-xs text-text-tertiary">
              <Star className="mr-1 inline h-3 w-3" />
              {remaining} lead{remaining === 1 ? '' : 's'} left in this session · {queue.length} total
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
