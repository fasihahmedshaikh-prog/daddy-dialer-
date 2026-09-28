// Mints a short-lived Twilio Voice Access Token for the browser's Twilio
// Voice SDK (Twilio.Device). Called from the frontend on app load and
// whenever the SDK reports the token is about to expire.
//
// Deploy: supabase functions deploy twilio-token
// Secrets required (see .env.example): none beyond the Twilio ones already
// listed there, set per-workspace in workspace_settings by the Settings page.
import twilio from 'npm:twilio@5.3.0';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseForRequest } from '../_shared/supabaseAdmin.ts';

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return json({ error: 'workspace_id is required' }, 400);
    }

    // Verify the caller is actually signed in and a member of this workspace.
    const userClient = supabaseForRequest(req);
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'unauthorized' }, 401);
    }

    const admin = supabaseAdmin();
    const { data: membership } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) {
      return json({ error: 'not a member of this workspace' }, 403);
    }

    const { data: settings, error: settingsErr } = await admin
      .from('workspace_settings')
      .select('twilio_api_key, twilio_api_secret, twilio_twiml_app_sid, twilio_account_sid')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (settingsErr || !settings?.twilio_api_key || !settings?.twilio_api_secret || !settings?.twilio_twiml_app_sid) {
      return json(
        { error: 'Twilio is not configured for this workspace yet. Add your Twilio API Key/Secret and TwiML App SID in Settings.' },
        400
      );
    }

    const token = new AccessToken(
      settings.twilio_account_sid,
      settings.twilio_api_key,
      settings.twilio_api_secret,
      { identity: user.id, ttl: 3600 }
    );

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: settings.twilio_twiml_app_sid,
      incomingAllow: true,
    });
    token.addGrant(voiceGrant);

    return json({ token: token.toJwt(), identity: user.id });
  } catch (err) {
    console.error('twilio-token error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
