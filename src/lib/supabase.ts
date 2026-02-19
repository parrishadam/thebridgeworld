import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singletons — clients are created on first use, not at module load time.
// This prevents "supabaseUrl is required" crashes during Next.js cold starts
// when env vars may not yet be available at module evaluation time.

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Public anon client — respects Row Level Security.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing Supabase anon env vars");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Service-role admin client — bypasses RLS.
 * ⚠️  SERVER-SIDE ONLY. Never import this in a Client Component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service role env vars");
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}
