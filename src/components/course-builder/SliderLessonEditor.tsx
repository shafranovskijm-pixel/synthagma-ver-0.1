import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Presentation, Upload, Loader2, Trash2, Eye, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseSliderContent, type SliderSlide, type SliderContent } from "@/utils/courseBuilderHelpers";
import type { Lesson } from "@/components/course-builder/LessonTypeConfig";

interface SliderLessonEditorProps {
  lesson: Lesson;
  courseId: string | undefined;
  onUpdate: (updates: Partial<Lesson>) => void;
}

export function SliderLessonEditor({ lesson, courseId, onUpdate }: SliderLessonEditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const sliderContent = parseSliderContent(lesson.content);
  const slides = sliderContent.slides;
  const pptxFileUrl = sliderContent.pptxFileUrl;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'pptx') {
      setError('Формат .ppt не поддерживается. Откройте файл в PowerPoint и сохраните как .pptx');
      return;
    }

    setIsLoading(true);
    setError(null);
    setUploadProgress('Загрузка файла...');

    try {
      const safeFileName = file.name
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        || 'presentation.pptx';
      
      const uploadPath = `${courseId || 'temp'}/${lesson.id}_${Date.now()}_${safeFileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('presentations')
        .upload(uploadPath, file, { upsert: true });
        
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Ошибка загрузки файла');
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('presentations')
        .getPublicUrl(uploadPath);

      setUploadProgress('Обработка презентации...');

      const JSZip = (await import('jszip')).default;
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/));
      
      const slidesArray: SliderSlide[] = [];
      
      for (let i = 0; i < slideFiles.length; i++) {
        slidesArray.push({
          id: crypto.randomUUID(),
          title: `Слайд ${i + 1}`,
          content: ''
        });
      }
      
      const newContent: SliderContent = {
        slides: slidesArray,
        pptxFileUrl: publicUrl
      };
      
      onUpdate({ 
        content: JSON.stringify(newContent),
        title: lesson.title || file.name.replace(/\.pptx$/i, '')
      });
      
      setCurrentIndex(0);
      toast.success(`Загружена презентация с ${slideFiles.length} слайдами`);
    } catch (err) {
      console.error('Error uploading PPTX:', err);
      setError('Ошибка при загрузке файла');
    } finally {
      setIsLoading(false);
      setUploadProgress('');
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index);
    }
  };

  const removeSlider = () => {
    onUpdate({ content: '[]' });
    setCurrentIndex(0);
  };

  if (slides.length === 0) {
    return (
      <div className="space-y-3">
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
          <Presentation className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
          <p className="text-xs text-muted-foreground/70 mb-4">Слайды с изображениями будут отображаться как интерактивный слайдер</p>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          {isLoading && uploadProgress && <p className="text-xs text-amber-500 mb-4">{uploadProgress}</p>}
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-500/5 transition-colors">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <Upload className="w-4 h-4 text-amber-500" />}
            <span className="text-sm">{isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}</span>
            <input type="file" accept=".pptx" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
          </label>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  const getViewerUrl = (fileUrl: string): string => {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-500">
            <Presentation className="w-5 h-5" />
            <span className="font-medium text-sm">{slides.length} слайдов</span>
          </div>
          <div className="flex items-center gap-2">
            {pptxFileUrl && (
              <a href={pptxFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-500 hover:underline">
                Скачать
              </a>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={removeSlider}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {pptxFileUrl ? (
          <div className="relative bg-white">
            <iframe
              src={getViewerUrl(pptxFileUrl)}
              className="w-full border-0"
              style={{ height: '450px' }}
              title="Предпросмотр презентации"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
            <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
              <p className="text-xs text-muted-foreground">Используйте стрелки ← → или прокрутку для навигации</p>
              <a href={getViewerUrl(pptxFileUrl)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors">
                <Eye className="w-3.5 h-3.5" />
                На весь экран
              </a>
            </div>
          </div>
        ) : (
          <div className="p-6 min-h-[250px]">
            {currentSlide && (
              <div className="space-y-4">
                {currentSlide.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                    <img src={currentSlide.imageUrl} alt={currentSlide.title || 'Слайд'} className="w-full max-h-[400px] object-contain" />
                  </div>
                )}
                <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
                {currentSlide.content && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{currentSlide.content}</div>
                )}
              </div>
            )}
          </div>
        )}

        {!pptxFileUrl && slides.length > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
            <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex - 1)} disabled={currentIndex === 0} className="gap-1">
              <ChevronDown className="w-4 h-4 rotate-90" />
              Назад
            </Button>
            <div className="flex gap-1 overflow-x-auto max-w-[200px]">
              {slides.map((_, i) => (
                <button key={i} onClick={() => goToSlide(i)}
                  className={`w-2 h-2 rounded-full transition-colors flex-shrink-0 ${i === currentIndex ? "bg-amber-500" : "bg-amber-500/30 hover:bg-amber-500/50"}`} />
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex + 1)} disabled={currentIndex === slides.length - 1} className="gap-1">
              Далее
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
