import { createClient } from "@supabase/supabase-js";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Public anon client — respects Row Level Security.
 * Safe to use in browser contexts (currently has no RLS policies open,
 * so it effectively has no read/write access).
 */
export const supabase = createClient(url, anonKey);

/**
 * Service-role admin client — bypasses RLS.
 * ⚠️  SERVER-SIDE ONLY. Never import this in a Client Component.
 *     The env var SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix,
 *     so Next.js will not bundle it into client code.
 */
export const supabaseAdmin = createClient(url, svcKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
