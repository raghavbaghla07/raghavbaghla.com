import { createClient } from '@supabase/supabase-js';

// Publishable credentials only. Row-level security is the authorization boundary.
const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key);

export function createPublicClient() {
  if (!configured) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function createStudioClient() {
  if (!configured) return null;
  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
