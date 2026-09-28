// The TwiML App's "Voice Request URL". Twilio POSTs here the moment the
// browser's Twilio.Device.connect({ params }) places an outbound call.
// Custom params passed from the client (To, workspace_id, lead_id,
// session_id) arrive as regular POST body fields alongside Twilio's own
// (CallSid, From, etc).
//
// Every call is placed into its OWN named conference room from the start
// (host leg here + the lead's leg bridged in via the REST API below), even
// though 99% of calls only ever have two parties. This is deliberate: a
// Twilio Device can hold only one active WebRTC connection at a time, so
// there is no way to open a second browser-side call to bridge someone in
// mid-call. Starting every call as a conference means "join me" (see
// twilio-add-participant) is just another REST call joining the SAME
// room — no renegotiation of the browser's own connection required.
//
// Deploy: supabase functions deploy twilio-voice-twiml --no-verify-jwt
// (--no-verify-jwt because Twilio's webhook carries no Supabase JWT)
import twilio from 'npm:twilio@5.3.0';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { conferenceNameFor } from '../_shared/conference.ts';

const VoiceResponse = twilio.twiml.VoiceResponse;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const form = await req.formData();
  const to = String(form.get('To') ?? '');
  const workspaceId = String(form.get('workspace_id') ?? '');
  const leadId = form.get('lead_id') ? String(form.get('lead_id')) : null;
  const sessionId = form.get('session_id') ? String(form.get('session_id')) : null;
  const callSid = String(form.get('CallSid') ?? '');

  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('workspace_settings')
    .select('twilio_account_sid, twilio_auth_token, twilio_caller_number')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const callerNumber = settings?.twilio_caller_number ?? undefined;
  const functionsBase = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.supabase.co/functions/v1');
  const statusCallbackUrl = `${functionsBase}/twilio-status-callback`;
  const recordingCallbackUrl = `${functionsBase}/twilio-recording-callback`;

  // Log the call immediately so it shows up in the Call Log the instant it
  // starts ringing, not only once it completes. This row (keyed by the
  // browser leg's CallSid) is what the app later PATCHes with an outcome.
  if (callSid && to) {
    await admin.from('dial_call_logs').upsert(
      {
        workspace_id: workspaceId,
        lead_id: leadId,
        session_id: sessionId,
        twilio_call_sid: callSid,
        direction: 'outbound',
        from_number: callerNumber ?? null,
        to_number: to,
        call_state: 'ringing',
        is_conference: true,
        called_at: new Date().toISOString(),
      },
      { onConflict: 'twilio_call_sid' }
    );
  }

  const conferenceName = conferenceNameFor(sessionId, callSid);
  const twiml = new VoiceResponse();

  const dial = twiml.dial();
  dial.conference(
    {
      startConferenceOnEnter: true,
      // false, not true: if the rep's own leg briefly drops, the lead's
      // leg (and any bridged-in third party) should NOT be hung up with it.
      endConferenceOnExit: false,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['start', 'end', 'join', 'leave'],
    },
    conferenceName
  );

  // Bridge the lead's own number into the same room via the REST API — an
  // independent call leg, not a nested <Dial><Number>, so it can be
  // recorded/tracked on its own and so a later "join me" add is just one
  // more of these, same shape.
  if (settings?.twilio_account_sid && settings?.twilio_auth_token && callerNumber && to) {
    try {
      const client = twilio(settings.twilio_account_sid, settings.twilio_auth_token);
      const joinUrl = `${functionsBase}/twilio-conference-twiml?conferenceName=${encodeURIComponent(
        conferenceName
      )}&role=lead`;
      await client.calls.create({
        to,
        from: callerNumber,
        url: joinUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: recordingCallbackUrl,
      });
    } catch (err) {
      console.error('failed to bridge lead into conference', err);
    }
  }

  return new Response(twiml.toString(), {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
});
