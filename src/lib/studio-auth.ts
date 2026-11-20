import type { SupportedStorage, SupabaseClient } from '@supabase/supabase-js';

export function studioAuthOptions(storage?: SupportedStorage) {
  return {
    // Recovery emails can open in a different tab/device; no tab-bound PKCE verifier.
    flowType: 'implicit' as const,
    persistSession: true,
    storage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  };
}

export function requestSignInLink(client: SupabaseClient, email: string, origin: string) {
  return client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:`${origin}/studio/`}});
}
