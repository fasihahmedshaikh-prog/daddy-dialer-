// TwiML endpoint any additional leg joins to be bridged into an existing
// conference room — used for (a) the lead's own leg in "join me" mode,
// created via the REST API call in twilio-voice-twiml, and (b) a manual
// third-party add from the floating dial widget ("bridge this number in").
//
// Deploy: supabase functions deploy twilio-conference-twiml --no-verify-jwt
import twilio from 'npm:twilio@5.3.0';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const VoiceResponse = twilio.twiml.VoiceResponse;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const conferenceName = url.searchParams.get('conferenceName') ?? '';
  const role = url.searchParams.get('role') ?? 'guest';

  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.conference(
    {
      startConferenceOnEnter: role !== 'lead', // lead joining shouldn't restart a room that already ended
      endConferenceOnExit: false,
    },
    conferenceName
  );

  return new Response(twiml.toString(), {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
});
