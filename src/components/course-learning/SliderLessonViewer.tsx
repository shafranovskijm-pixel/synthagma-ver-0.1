import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Presentation, FileText, ChevronLeft, ChevronRight} from "lucide-react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface SliderSlide {
  id: string;
  content: string;
  title?: string;
  imageUrl?: string;
}

interface SliderContent {
  slides: SliderSlide[];
  pptxFileUrl?: string;
}

export const parseSliderContent = (content: string | null): SliderContent => {
  try {
    if (!content) return { slides: [] };
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return { slides: parsed };
    if (typeof parsed === 'object' && parsed !== null) {
      return { slides: Array.isArray(parsed.slides) ? parsed.slides : [], pptxFileUrl: parsed.pptxFileUrl };
    }
    return { slides: [] };
  } catch { return { slides: [] }; }
};

interface SliderLessonViewerProps {
  content: string | null;
  title: string;
  lessonIndex: number;
  isMobile: boolean;
}

export const SliderLessonViewer = ({ content, title, lessonIndex, isMobile }: SliderLessonViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [viewerError, setViewerError] = useState(false);
  const sliderContent = parseSliderContent(content);
  const slides = sliderContent.slides;
  const pptxFileUrl = sliderContent.pptxFileUrl;

  const getViewerUrl = (fileUrl: string) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

  if (pptxFileUrl) {
    return (
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
          <div className={cn("rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}>
            <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={cn("font-display font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{title}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Презентация • {slides.length} слайдов</p>
          </div>
          <a href={pptxFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors">
            <FileText className="w-3.5 h-3.5" />{!isMobile && "Скачать"}
          </a>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
          <div className="relative w-full" style={{ minHeight: isMobile ? '400px' : '600px' }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
                <div className="flex flex-col items-center gap-3"><SigmaSpinner size="lg" className="text-amber-500" /><p className="text-sm text-muted-foreground">Загрузка...</p></div>
              </div>
            )}
            {viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-6">
                  <Presentation className="w-16 h-16 mx-auto mb-4 text-amber-500/50" />
                  <p className="text-muted-foreground mb-4">Не удалось загрузить</p>
                  <a href={pptxFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                    <FileText className="w-4 h-4" />Скачать презентацию
                  </a>
                </div>
              </div>
            ) : (
              <iframe src={getViewerUrl(pptxFileUrl)} className="w-full h-full border-0" style={{ minHeight: isMobile ? '400px' : '600px' }} onLoad={() => setIsLoading(false)} onError={() => { setIsLoading(false); setViewerError(true); }} title={title} allowFullScreen />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback slide-by-slide view
  const [currentIndex, setCurrentIndex] = useState(0);

  if (slides.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
          <div className={cn("rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}>
            <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
          </div>
          <div className="min-w-0"><h1 className={cn("font-display font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{title}</h1><p className="text-xs md:text-sm text-muted-foreground">Презентация {lessonIndex + 1}</p></div>
        </div>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="text-center"><Presentation className="w-16 h-16 mx-auto mb-4 opacity-50" /><p>Презентация не загружена</p></div>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
        <div className={cn("rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}>
          <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={cn("font-display font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{title}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Презентация • Слайд {currentIndex + 1} из {slides.length}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
        <div className={cn("p-8 min-h-[300px] md:min-h-[400px]", isMobile && "p-4")}>
          {currentSlide.title && <h2 className="font-display text-xl md:text-2xl font-bold mb-4 text-center">{currentSlide.title}</h2>}
          {currentSlide.imageUrl && (
            <div className="flex justify-center mb-4">
              <img src={currentSlide.imageUrl} alt={currentSlide.title || `Слайд ${currentIndex + 1}`} className="max-h-64 md:max-h-80 rounded-xl object-contain border border-border" />
            </div>
          )}
          <div className="prose prose-lg max-w-none dark:prose-invert text-center" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentSlide.content || '') }} />
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)} disabled={currentIndex === 0} className="rounded-xl">
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
          <div className="flex gap-1">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrentIndex(i)} className={cn("w-2 h-2 rounded-full transition-all", i === currentIndex ? "bg-amber-500 w-6" : "bg-muted-foreground/30 hover:bg-muted-foreground/50")} />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => currentIndex < slides.length - 1 && setCurrentIndex(currentIndex + 1)} disabled={currentIndex === slides.length - 1} className="rounded-xl">
            Далее<ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};
