import { useState, useEffect } from 'react';
import { initExternalSupabase, getExternalSupabase } from '@/integrations/external-supabase/client';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
interface UploadResult {
  url: string;
  path: string;
  storage: 'external' | 'internal';
}

export const useExternalStorage = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [isExternalConfigured, setIsExternalConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    initExternalSupabase().then((client) => {
      setIsExternalConfigured(!!client);
      setIsLoading(false);
    });
  }, []);

  const uploadFile = async (
    file: File,
    bucket: string,
    path: string
  ): Promise<UploadResult | null> => {
    setIsUploading(true);

    try {
      const externalClient = getExternalSupabase();
      
      // Try external Supabase first
      if (externalClient) {
        // For external storage: videos → course-videos, everything else → course-files
        const isVideo = file.type.startsWith('video/');
        const externalBucket = isVideo ? 'course-videos' : 'course-files';
        
        const { data, error } = await externalClient.storage
          .from(externalBucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (error) throw error;

        const { data: { publicUrl } } = externalClient.storage
          .from(externalBucket)
          .getPublicUrl(path);

        return {
          url: publicUrl,
          path: data.path,
          storage: 'external',
        };
      }

      // Fallback to internal Supabase - always use course-files
      const internalBucket = 'course-files';
      
      const { data, error } = await supabase.storage
        .from(internalBucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from(internalBucket)
        .getPublicUrl(path);

      return {
        url: publicUrl,
        path: data.path,
        storage: 'internal',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить файл';
      toast.error("Ошибка загрузки", { description: message });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteFile = async (bucket: string, path: string, storage: 'external' | 'internal') => {
    try {
      const externalClient = getExternalSupabase();
      const client = storage === 'external' && externalClient 
        ? externalClient 
        : supabase;

      const { error } = await client.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить файл';
      toast.error("Ошибка удаления", { description: message });
      return false;
    }
  };

  return {
    uploadFile,
    deleteFile,
    isUploading,
    isLoading,
    isExternalConfigured,
  };
};
