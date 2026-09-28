import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

// Service-role client used ONLY inside Edge Functions — never ship the
// service role key to the browser. Reads workspace_settings (Twilio
// creds) and writes dial_call_logs / call_transcripts on Twilio's behalf,
// bypassing RLS deliberately because Twilio's webhooks carry no Supabase
// JWT to satisfy it.
export function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client bound to the caller's own JWT — used to verify the request came
// from a logged-in workspace member before minting a Twilio token, etc.
export function supabaseForRequest(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
