// Lets the Settings page verify Twilio Account SID/Auth Token actually
// work (and that the phone number is real/owned by the account) before
// saving, so a typo doesn't quietly break the dialer later.
//
// Deploy: supabase functions deploy test-twilio-credentials
import twilio from 'npm:twilio@5.3.0';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { supabaseForRequest } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userClient = supabaseForRequest(req);
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

    const { account_sid, auth_token, caller_number } = await req.json();
    if (!account_sid || !auth_token) {
      return json({ ok: false, error: 'Account SID and Auth Token are required' }, 400);
    }

    const client = twilio(account_sid, auth_token);
    const account = await client.api.v2010.accounts(account_sid).fetch();

    let numberOwned = true;
    if (caller_number) {
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: caller_number, limit: 1 });
      numberOwned = numbers.length > 0;
    }

    return json({
      ok: true,
      accountStatus: account.status,
      friendlyName: account.friendlyName,
      numberOwned,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
