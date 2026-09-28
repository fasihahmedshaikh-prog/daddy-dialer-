// Twilio recording-status webhook (fires once a recording finishes
// processing). Attaches the recording URL/SID to the matching call log row
// and seeds a call_transcripts row in "pending" status — plug a real
// transcription provider (Twilio's own Voice Intelligence, Whisper, Deepgram,
// etc.) into this function later to fill in transcript_text asynchronously.
//
// Deploy: supabase functions deploy twilio-recording-callback --no-verify-jwt
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const form = await req.formData();
    const callSid = String(form.get('CallSid') ?? '');
    const recordingUrl = form.get('RecordingUrl') ? `${form.get('RecordingUrl')}.mp3` : null;
    const recordingSid = form.get('RecordingSid') ? String(form.get('RecordingSid')) : null;

    if (!callSid || !recordingUrl) {
      return new Response('missing fields', { status: 400, headers: corsHeaders });
    }

    const admin = supabaseAdmin();
    const { data: log } = await admin
      .from('dial_call_logs')
      .update({ recording_url: recordingUrl, recording_sid: recordingSid })
      .eq('twilio_call_sid', callSid)
      .select('id, workspace_id')
      .maybeSingle();

    if (log) {
      await admin.from('call_transcripts').upsert(
        { call_log_id: log.id, workspace_id: log.workspace_id, status: 'pending' },
        { onConflict: 'call_log_id' }
      );
    }

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    console.error('twilio-recording-callback error', err);
    return new Response('error', { status: 500, headers: corsHeaders });
  }
});
