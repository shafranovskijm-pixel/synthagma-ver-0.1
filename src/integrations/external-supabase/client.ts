import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// External Supabase client for video and document storage
let externalSupabaseClient: SupabaseClient | null = null;
let configLoaded = false;
let configPromise: Promise<void> | null = null;

interface ExternalConfig {
  configured: boolean;
  url: string | null;
  key: string | null;
}

const loadConfig = async (): Promise<ExternalConfig> => {
  try {
    const { data, error } = await supabase.functions.invoke('get-external-storage-config');
    if (error) throw error;
    return data as ExternalConfig;
  } catch {
    return { configured: false, url: null, key: null };
  }
};

export const initExternalSupabase = async (): Promise<SupabaseClient | null> => {
  if (configLoaded) return externalSupabaseClient;
  
  if (!configPromise) {
    configPromise = loadConfig().then((config) => {
      if (config.configured && config.url && config.key) {
        externalSupabaseClient = createClient(config.url, config.key);
      }
      configLoaded = true;
    });
  }
  
  await configPromise;
  return externalSupabaseClient;
};

export const getExternalSupabase = () => externalSupabaseClient;

export const isExternalStorageConfigured = () => {
  return !!externalSupabaseClient;
};

// For backwards compatibility - will be null until initExternalSupabase is called
export const externalSupabase = null as SupabaseClient | null;
