
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function configuredClient() {
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
  } catch {
    // Invalid deployment configuration must not render a blank page or expose keys.
    return null;
  }
}

export const supabase = configuredClient();
