import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// Deliberately untyped generic here: this project ships hand-written
// TypeScript interfaces in src/types/database.ts (cast at each call site)
// rather than a generated Database type, so every table/rpc stays usable
// without fighting strict generic inference. Run
// `supabase gen types typescript --project-id <ref> > src/types/supabase-generated.ts`
// later and swap it in to `createClient<Database>` for full end-to-end typing.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
