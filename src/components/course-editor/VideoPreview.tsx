import DOMPurify from "dompurify";
import { Video, ExternalLink } from "lucide-react";

function isIframeEmbed(content: string): boolean {
  return content.trim().startsWith('<iframe') && content.includes('</iframe>');
}

// Сервисы, запрещающие встраивание (frame-ancestors / X-Frame-Options).
function detectNoEmbedService(content: string): { label: string; url: string } | null {
  const url = content.trim();
  if (/(?:^|\/\/)([a-zA-Z0-9-]+\.)?ktalk\.ru\//i.test(url)) return { label: 'Контур.Толк', url };
  if (/zoom\.us\//i.test(url)) return { label: 'Zoom', url };
  if (/teams\.microsoft\./i.test(url)) return { label: 'Microsoft Teams', url };
  if (/meet\.google\./i.test(url)) return { label: 'Google Meet', url };
  if (/webinar\.ru\//i.test(url)) return { label: 'Webinar.ru', url };
  return null;
}

function getEmbedFromContent(content: string): { type: 'iframe' | 'url' | 'direct' | 'no-embed' | null; value: string | null; serviceLabel?: string } {
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

  const noEmbed = detectNoEmbedService(content);
  if (noEmbed) return { type: 'no-embed', value: noEmbed.url, serviceLabel: noEmbed.label };

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

  if (embedResult.type === 'no-embed') {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Video className="w-12 h-12 text-primary/60" />
        <div>
          <p className="text-sm font-medium text-foreground mb-1">{embedResult.serviceLabel} не разрешает встраивание</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Запись откроется у ученика в новой вкладке. Лучше скачать видео из {embedResult.serviceLabel} и загрузить файлом — оно будет проигрываться прямо в уроке.
          </p>
        </div>
        <a
          href={embedResult.value || ''}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Открыть запись
        </a>
      </div>
    );
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
