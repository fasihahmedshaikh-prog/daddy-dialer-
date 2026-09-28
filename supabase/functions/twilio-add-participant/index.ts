// Bridges an additional phone number into a call that's already in
// progress ("join me" mode) — a pure server-side REST call that joins the
// SAME conference room the browser's own leg is already in. Deliberately
// does NOT touch the browser's Twilio.Device connection at all: a Device
// can only hold one active call, so the only way to add a third party is
// a new independent call leg created here, not a second device.connect().
//
// Deploy: supabase functions deploy twilio-add-participant
import twilio from 'npm:twilio@5.3.0';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseForRequest } from '../_shared/supabaseAdmin.ts';
import { conferenceNameFor } from '../_shared/conference.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { workspace_id, host_call_sid, session_id, to_number } = await req.json();
    if (!workspace_id || !host_call_sid || !to_number) {
      return json({ error: 'workspace_id, host_call_sid and to_number are required' }, 400);
    }

    const userClient = supabaseForRequest(req);
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = supabaseAdmin();
    const { data: membership } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return json({ error: 'not a member of this workspace' }, 403);

    const { data: settings } = await admin
      .from('workspace_settings')
      .select('twilio_account_sid, twilio_auth_token, twilio_caller_number')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (!settings?.twilio_account_sid || !settings?.twilio_auth_token || !settings?.twilio_caller_number) {
      return json({ error: 'Twilio is not fully configured for this workspace.' }, 400);
    }

    const conferenceName = conferenceNameFor(session_id ?? null, host_call_sid);
    const functionsBase = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.supabase.co/functions/v1');
    const client = twilio(settings.twilio_account_sid, settings.twilio_auth_token);

    const call = await client.calls.create({
      to: to_number,
      from: settings.twilio_caller_number,
      url: `${functionsBase}/twilio-conference-twiml?conferenceName=${encodeURIComponent(conferenceName)}&role=guest`,
      statusCallback: `${functionsBase}/twilio-status-callback`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${functionsBase}/twilio-recording-callback`,
    });

    await admin.from('dial_call_logs').insert({
      workspace_id,
      session_id: session_id ?? null,
      twilio_call_sid: call.sid,
      twilio_parent_call_sid: host_call_sid,
      direction: 'outbound',
      from_number: settings.twilio_caller_number,
      to_number,
      call_state: 'ringing',
      is_conference: true,
      called_at: new Date().toISOString(),
    });

    return json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error('twilio-add-participant error', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
