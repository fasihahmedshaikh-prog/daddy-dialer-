# Daddy Dialer

A dark-industrial B2B power-dialer CRM for cold-calling local service businesses. Import CSVs of
leads, organize them into calling sessions, and power through them with a browser-based
auto-dialer that logs every call, recording, and outcome.

Built with the same underlying stack Lovable's "Lovable Cloud" uses (Supabase) plus Twilio's Voice
SDK, so it does **not** require a Lovable subscription — you run it yourself. You do need your own
free Supabase project and a Twilio account (pay-as-you-go; Twilio itself isn't free since real
phone minutes cost money, but there's no subscription and new accounts get trial credit).

## What you get

- React 18 + Vite 5 + TypeScript, Tailwind (dark theme, `#0B0C0F`/`#14161B`/`#22C55E`), shadcn-style
  components, TanStack Query + Table, Recharts.
- Full Postgres schema with Row Level Security scoping every table to `workspace_id`, snake_case
  enums, phone-normalization-based dedup, a materialized view for dashboard performance.
- Twilio Voice SDK browser calling, a persistent DTMF keypad, Web Audio ringback tone, mic device
  picker, and a real conference-based "join me" bridge-in.
- CSV import with header detection, column mapping, and a 5-row preview.
- Sessions with per-session phone dedup and a sequential auto-dialer.
- A unified, paginated Call Log with recording playback and editable outcomes.
- A Dashboard with today/week/month KPIs and a 14-day calls chart.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a free account, and create a new project.
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy `.env.example` to `.env` and fill those two values in:
   ```
   cp .env.example .env
   ```

## 2. Run the database migrations

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) if you don't have it, then from
this project's root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This runs the four migrations in `supabase/migrations/` in order: schema, RLS policies, business
logic functions (auto-workspace-on-signup, CSV import dedup, session builder), and the dashboard
materialized view. If your Supabase plan doesn't include `pg_cron`, the hourly auto-refresh of the
dashboard view will silently skip (a notice is logged) — just click **Refresh** on the Dashboard
page after a calling session, which calls the same refresh function manually.

## 3. Set up Twilio

1. Create a [Twilio account](https://www.twilio.com/try-twilio) and buy a phone number (Console →
   Phone Numbers) — this is the caller ID your outbound calls will show.
2. Create an **API Key** (Console → Account → API keys & tokens → Create API Key, Standard type).
   Save the SID and Secret — the secret is only shown once.
3. Create a **TwiML App** (Console → Voice → TwiML Apps → Create new TwiML App). Leave the Voice
   Request URL blank for now — you'll fill it in after deploying the Edge Functions in step 4,
   pointing it at `https://YOUR_PROJECT_REF.supabase.co/functions/v1/twilio-voice-twiml`.

## 4. Deploy the Edge Functions

```bash
supabase functions deploy twilio-token
supabase functions deploy twilio-voice-twiml --no-verify-jwt
supabase functions deploy twilio-conference-twiml --no-verify-jwt
supabase functions deploy twilio-status-callback --no-verify-jwt
supabase functions deploy twilio-recording-callback --no-verify-jwt
supabase functions deploy twilio-add-participant
supabase functions deploy test-twilio-credentials
```

The `--no-verify-jwt` functions are the ones Twilio itself calls as webhooks — they carry no
Supabase auth header, so JWT verification has to be off for those specific functions (they still
check workspace membership internally where relevant).

No Twilio secrets need to go into Supabase Edge Function secrets — this app stores each
workspace's Twilio credentials in the `workspace_settings` table (via the Settings page) instead,
so a single deployment can serve multiple workspaces with different Twilio accounts. The Edge
Functions read them from there using the service role key, which Supabase provisions
automatically as `SUPABASE_SERVICE_ROLE_KEY` for every Edge Function — you don't need to set it.

Now go back to your TwiML App in the Twilio Console and set its **Voice Request URL** to:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/twilio-voice-twiml
```
(HTTP POST.)

## 5. Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, sign up (this auto-creates your workspace), then go to **Settings**
and paste in your Twilio Account SID, Auth Token, API Key SID/Secret, TwiML App SID, and caller
number. Click **Test credentials** to confirm they work before saving.

## 6. Deploy the frontend

Any static host works (Vercel, Netlify, Cloudflare Pages). Set the two `VITE_SUPABASE_*`
environment variables in that host's dashboard, then:
```bash
npm run build
```
and deploy the `dist/` folder.

## How calling actually works

Every call — whether started from a lead row, the Session Dialer, or the floating dial widget —
is placed into its own private Twilio Conference room from the moment it connects (the browser's
leg plus the lead's leg, bridged in automatically). This is deliberate, not overkill: a browser
can only hold one active Twilio Voice connection at a time, so the only way to later bridge a
third person in ("join me" mode) without disturbing the live call is if that call was already a
conference. Bridging someone in is then just one more server-side call joining the same room —
your side of the conversation never drops or re-negotiates.

Recordings and call state land in `dial_call_logs` via Twilio's status/recording webhooks, so the
Call Log stays accurate even if a browser tab crashes mid-call.

## What's stubbed / needs your own follow-up

- **Transcription**: `twilio-recording-callback` creates a `call_transcripts` row in `pending`
  status but doesn't call a transcription API. Wire in Twilio Voice Intelligence, Deepgram, or
  Whisper there to fill in `transcript_text` automatically.
- **Team invites**: the schema fully supports multiple `workspace_members` with roles, but there's
  no "invite a teammate" UI yet — add rows to `workspace_members` directly (via the Supabase
  Table Editor) for now, or ask for that page to be built next.
- **Generated Supabase types**: `src/types/database.ts` is hand-written to keep things readable;
  run `supabase gen types typescript --project-id YOUR_REF > src/types/supabase-generated.ts` for
  fully generated, always-in-sync types once your schema stabilizes.
- **International numbers**: phone normalization (both the SQL `normalize_phone()` and the client
  `normalizePhone()`) assumes US numbers when it sees 10 or 11 digits. Fine for the stated use
  case (local US service businesses); revisit if you expand outside the US.
