import DOMPurify from "dompurify";
import { Video } from "lucide-react";

function isIframeEmbed(content: string): boolean {
  return content.trim().startsWith('<iframe') && content.includes('</iframe>');
}

function getEmbedFromContent(content: string): { type: 'iframe' | 'url' | 'direct' | null; value: string | null } {
  if (!content) return { type: null, value: null };
  if (isIframeEmbed(content)) return { type: 'iframe', value: content };

  const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return { type: 'url', value: `https://www.youtube.com/embed/${ytMatch[1]}` };
  const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { type: 'url', value: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) return { type: 'url', value: `https://rutube.ru/play/embed/${rutubeMatch[1]}` };
  const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vkMatch) return { type: 'url', value: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2` };
  const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (ktalkMatch) return { type: 'url', value: `https://${ktalkMatch[1]}.ktalk.ru/recordings/${ktalkMatch[2]}` };
  const dzenMatch = content.match(/dzen\.ru\/(?:video\/watch|embed)\/([a-zA-Z0-9_-]+)/);
  if (dzenMatch) return { type: 'url', value: `https://dzen.ru/embed/${dzenMatch[1]}` };
  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) return { type: 'url', value: `https://ok.ru/videoembed/${okMatch[1]}` };
  const mailMatch = content.match(/my\.mail\.ru\/(?:mail|bk|inbox|list)\/([^\/]+)\/video\/([^\/]+)\/(\d+)/);
  if (mailMatch) return { type: 'url', value: `https://my.mail.ru/video/embed/${mailMatch[3]}` };
  const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
  if (yandexMatch) return { type: 'url', value: `https://yandex.ru/video/preview/${yandexMatch[1]}` };

  if (content.match(/\.(mp4|webm|ogg|mov|mkv|m4v|ts|m2ts|mts|mpg|mpeg|m3u8)(\?.*)?$/i) || content.includes("selcdn.ru"))
    return { type: 'direct' as any, value: content };

  if (content.match(/^https?:\/\/.*\/recordings?\//i) || content.match(/^https?:\/\/.*\/video\//i))
    return { type: 'url', value: content };

  return { type: null, value: null };
}

export function VideoPreview({ videoUrl }: { videoUrl: string }) {
  const embedResult = getEmbedFromContent(videoUrl);

  if (embedResult.type === null) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center border border-border">
        <div className="text-center"><Video className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Превью недоступно</p></div>
      </div>
    );
  }

  if (embedResult.type === 'direct') {
    return <div className="aspect-video bg-black rounded-xl overflow-hidden"><video src={embedResult.value || ''} controls className="w-full h-full" controlsList="nodownload" /></div>;
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      {embedResult.type === 'iframe' ? (
        <div className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(embedResult.value || '', {
            ALLOWED_TAGS: ['iframe'], ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'referrerpolicy'] }) }} />
      ) : (
        <iframe src={embedResult.value || ''} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
      )}
    </div>
  );
}
