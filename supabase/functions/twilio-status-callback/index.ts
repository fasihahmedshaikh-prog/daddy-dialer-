// Twilio call-status webhook. Fires on initiated/ringing/answered/completed
// (and busy/failed/no-answer/canceled) for both the direct-dial and
// conference-bridge legs. Keeps dial_call_logs in sync with reality even
// if the browser tab closes mid-call.
//
// Deploy: supabase functions deploy twilio-status-callback --no-verify-jwt
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import type { CallState } from '../_shared/types.ts';

const STATUS_MAP: Record<string, CallState> = {
  queued: 'queued',
  initiated: 'ringing',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  completed: 'completed',
  busy: 'busy',
  failed: 'failed',
  'no-answer': 'no_answer',
  canceled: 'canceled',
};

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const form = await req.formData();
    const callSid = String(form.get('CallSid') ?? '');
    const callStatus = String(form.get('CallStatus') ?? '');
    const duration = form.get('CallDuration') ? Number(form.get('CallDuration')) : null;
    const from = form.get('From') ? String(form.get('From')) : null;

    if (!callSid) return new Response('missing CallSid', { status: 400, headers: corsHeaders });

    const mapped = STATUS_MAP[callStatus] ?? 'in_progress';
    const admin = supabaseAdmin();

    const update: Record<string, unknown> = { call_state: mapped, updated_at: new Date().toISOString() };
    if (duration !== null) update.duration_seconds = duration;
    if (from) update.from_number = from;
    if (['completed', 'busy', 'failed', 'no_answer', 'canceled'].includes(mapped)) {
      update.ended_at = new Date().toISOString();
    }

    await admin.from('dial_call_logs').update(update).eq('twilio_call_sid', callSid);

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    console.error('twilio-status-callback error', err);
    return new Response('error', { status: 500, headers: corsHeaders });
  }
});
