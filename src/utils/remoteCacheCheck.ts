import { supabase } from "@/integrations/supabase/client";

const REMOTE_CACHE_KEY = 'remote-cache-ver';

export async function checkRemoteCacheVersion(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'force_cache_version')
      .maybeSingle();

    if (error || !data) return false;

    const remoteVersion = data.setting_value;
    const localVersion = localStorage.getItem(REMOTE_CACHE_KEY);

    if (localVersion !== null && localVersion !== remoteVersion) {
      localStorage.setItem(REMOTE_CACHE_KEY, remoteVersion);
      return true; // needs purge + reload
    }

    // First visit or same version — store and continue
    localStorage.setItem(REMOTE_CACHE_KEY, remoteVersion);
    return false;
  } catch {
    return false;
  }
}
