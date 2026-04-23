import { useState, useEffect, useRef, useCallback } from 'react';
import { initExternalSupabase, getExternalSupabase } from '@/integrations/external-supabase/client';
import { supabase } from '@/integrations/supabase/client';
import { safeInvoke } from '@/utils/safeInvoke';
import { toast } from "sonner";
interface UploadResult {
  url: string;
  path: string;
  storage: 'external' | 'internal';
}

interface ExternalStorageConfig {
  configured: boolean;
  url: string | null;
  key: string | null;
}

// Cache config to avoid repeated calls
let cachedConfig: ExternalStorageConfig | null = null;

const getExternalConfig = async (): Promise<ExternalStorageConfig> => {
  if (cachedConfig) return cachedConfig;
  
  try {
    const { data, error } = await safeInvoke<any>('get-external-storage-config');
    if (error) throw error;
    cachedConfig = data as ExternalStorageConfig;
    return cachedConfig;
  } catch {
    return { configured: false, url: null, key: null };
  }
};

export const useExternalStorageWithProgress = () => {
  const [isExternalConfigured, setIsExternalConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [externalConfig, setExternalConfig] = useState<ExternalStorageConfig | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  useEffect(() => {
    getExternalConfig().then((config) => {
      setExternalConfig(config);
      setIsExternalConfigured(config.configured);
      setIsLoading(false);
    });
    
    // Also init the external client for other operations
    initExternalSupabase().then((client) => {
      if (!isExternalConfigured && client) {
        setIsExternalConfigured(true);
      }
    });
  }, []);

  const uploadWithProgress = useCallback(async (
    file: File,
    bucket: string,
    path: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult | null> => {
    const config = externalConfig || await getExternalConfig();
    
    // Determine which storage to use
    const useExternal = config.configured && config.url && config.key;
    
    const baseUrl = useExternal ? config.url : import.meta.env.VITE_SUPABASE_URL;
    const apiKey = useExternal ? config.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    // For external storage: videos → course-videos, everything else → course-files
    // For internal storage: always course-files
    const isVideo = file.type.startsWith('video/');
    const actualBucket = useExternal 
      ? (isVideo ? 'course-videos' : 'course-files')
      : 'course-files';
    
    // Get auth token for internal storage
    let authToken = apiKey;
    if (!useExternal) {
      const { data: session } = await supabase.auth.getSession();
      authToken = session?.session?.access_token || apiKey;
    }
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      
      const uploadUrl = `${baseUrl}/storage/v1/object/${actualBucket}/${path}`;
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });
      
      xhr.addEventListener('load', () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          // Get public URL with the actual bucket name used
          const publicUrl = `${baseUrl}/storage/v1/object/public/${actualBucket}/${path}`;
          resolve({
            url: publicUrl,
            path: path,
            storage: useExternal ? 'external' : 'internal',
          });
        } else {
          let errorMessage = 'Ошибка загрузки';
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.message || response.error || errorMessage;
          } catch {}
          reject(new Error(errorMessage));
        }
      });
      
      xhr.addEventListener('error', () => {
        xhrRef.current = null;
        reject(new Error('Ошибка соединения при загрузке'));
      });
      
      xhr.addEventListener('abort', () => {
        xhrRef.current = null;
        reject(new Error('Загрузка отменена'));
      });
      
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.setRequestHeader('apikey', apiKey!);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.send(file);
    });
  }, [externalConfig]);

  const abortUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }, []);

  const uploadFile = useCallback(async (
    file: File,
    bucket: string,
    path: string
  ): Promise<UploadResult | null> => {
    try {
      const externalClient = getExternalSupabase();
      
      // Try external Supabase first
      if (externalClient) {
        const { data, error } = await externalClient.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (error) throw error;

        const { data: { publicUrl } } = externalClient.storage
          .from(bucket)
          .getPublicUrl(path);

        return {
          url: publicUrl,
          path: data.path,
          storage: 'external',
        };
      }

      // Fallback to internal Supabase
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      return {
        url: publicUrl,
        path: data.path,
        storage: 'internal',
      };
    } catch (error: unknown) {
      toast.error("Ошибка загрузки", { description: getErrorMessage(error, 'Не удалось загрузить файл') });
      return null;
    }
  }, [toast]);

  return {
    uploadFile,
    uploadWithProgress,
    abortUpload,
    isLoading,
    isExternalConfigured,
  };
};
