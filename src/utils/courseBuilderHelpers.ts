import { supabase } from "@/integrations/supabase/client";

// Helper function to get external storage config
export const getExternalStorageConfig = async (): Promise<{ configured: boolean; url: string | null; key: string | null }> => {
  try {
    const { data } = await supabase.functions.invoke('get-external-storage-config');
    return data || { configured: false, url: null, key: null };
  } catch {
    return { configured: false, url: null, key: null };
  }
};

// Helper function to upload file to external or internal storage
export const uploadToStorage = async (
  file: File | Blob,
  bucket: string,
  path: string,
  contentType?: string
): Promise<{ url: string; storage: 'external' | 'internal' } | null> => {
  const config = await getExternalStorageConfig();
  const useExternal = config.configured && config.url && config.key;

  const baseUrl = useExternal ? config.url : import.meta.env.VITE_SUPABASE_URL;
  const apiKey = useExternal ? config.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let authToken = apiKey;
  if (!useExternal) {
    const { data: session } = await supabase.auth.getSession();
    authToken = session?.session?.access_token || apiKey;
  }

  const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${path}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'apikey': apiKey!,
      'x-upsert': 'true',
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
  return { url: publicUrl, storage: useExternal ? 'external' : 'internal' };
};

// Helper function to check if URL can be embedded in iframe
export const canEmbedInIframe = (url: string): boolean => {
  const noEmbedPatterns = [
    /ktalk\.ru/i,
    /zoom\.us/i,
    /teams\.microsoft/i,
    /meet\.google/i
  ];
  return !noEmbedPatterns.some(pattern => pattern.test(url));
};

// Check if content is a Kinescope video reference
export const isKinescopeVideo = (content: string): boolean => {
  return content.startsWith('kinescope:');
};

// Extract Kinescope video ID from content
export const getKinescopeVideoId = (content: string): string | null => {
  if (content.startsWith('kinescope:')) return content.replace('kinescope:', '');
  const match = content.match(/kinescope\.io\/embed\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
};

// Get Kinescope embed URL (with optional DRM auth token)
export const getKinescopeEmbedUrl = (videoId: string, drmToken?: string): string => {
  const base = `https://kinescope.io/embed/${videoId}`;
  if (drmToken) return `${base}?drmauthtoken=${encodeURIComponent(drmToken)}`;
  return base;
};

// Generate a DRM auth token for Kinescope (valid 4 hours)
export const generateKinescopeDrmToken = (userId: string, courseId: string): string => {
  const payload = {
    userId,
    courseId,
    exp: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
  };
  return btoa(JSON.stringify(payload));
};

// Helper function to get embed URL from video content
export const getVideoEmbedUrl = (content: string): { url: string; canEmbed: boolean } | null => {
  if (!content) return null;

  // Kinescope
  const kinescopeId = getKinescopeVideoId(content);
  if (kinescopeId) return { url: getKinescopeEmbedUrl(kinescopeId), canEmbed: true };

  const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrcMatch) return { url: iframeSrcMatch[1], canEmbed: true };

  const youtubeMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) return { url: `https://www.youtube.com/embed/${youtubeMatch[1]}`, canEmbed: true };

  const vimeoMatch = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { url: `https://player.vimeo.com/video/${vimeoMatch[1]}`, canEmbed: true };

  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) return { url: `https://rutube.ru/play/embed/${rutubeMatch[1]}`, canEmbed: true };

  const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vkMatch) return { url: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2`, canEmbed: true };

  const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (ktalkMatch) return { url: content, canEmbed: false };

  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) return { url: `https://ok.ru/videoembed/${okMatch[1]}`, canEmbed: true };

  const mailMatch = content.match(/my\.mail\.ru\/video\/embed\/(\d+)/);
  if (mailMatch) return { url: `https://my.mail.ru/video/embed/${mailMatch[1]}`, canEmbed: true };

  const dzenMatch = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dzenMatch) return { url: `https://dzen.ru/embed/${dzenMatch[1]}`, canEmbed: true };

  const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
  if (yandexMatch) return { url: `https://yandex.ru/video/preview/${yandexMatch[1]}`, canEmbed: true };

  if (content.match(/^https?:\/\/.+/i)) return { url: content, canEmbed: canEmbedInIframe(content) };

  return null;
};

// Check if content is an iframe embed
export const isIframeEmbed = (content: string): boolean => {
  return content.trim().startsWith('<iframe');
};

// Slider content types
export interface SliderSlide {
  id: string;
  content: string;
  title?: string;
  imageUrl?: string;
}

export interface SliderContent {
  slides: SliderSlide[];
  pptxFileUrl?: string;
}

// Parse slider content - supports both old array format and new object format
export const parseSliderContent = (content: string | null): SliderContent => {
  try {
    if (!content) return { slides: [] };
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return { slides: parsed };
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        slides: Array.isArray(parsed.slides) ? parsed.slides : [],
        pptxFileUrl: parsed.pptxFileUrl
      };
    }
    return { slides: [] };
  } catch {
    return { slides: [] };
  }
};
