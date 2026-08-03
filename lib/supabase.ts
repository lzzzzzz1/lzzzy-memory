import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const supabase = !demoMode && url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
export const isSupabaseConfigured = Boolean(supabase);
