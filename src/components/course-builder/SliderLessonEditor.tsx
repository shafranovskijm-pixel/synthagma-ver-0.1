import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Presentation, Upload, Trash2, Eye, ChevronDown, ImagePlus, Replace, X, FolderOpen, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseSliderContent, type SliderSlide, type SliderContent } from "@/utils/courseBuilderHelpers";
import type { Lesson } from "@/components/course-builder/LessonTypeConfig";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";

interface SliderLessonEditorProps {
  lesson: Lesson;
  courseId: string | undefined;
  onUpdate: (updates: Partial<Lesson>) => void;
}

interface PptxFile {
  name: string;
  url: string;
  size: number;
  created_at: string;
}

interface SliderLessonEntry {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  slidesCount: number;
  content: string;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function PptxPickerDialog({ open, onClose, onSelect, onSelectSliderContent, currentLessonId }: { 
  open: boolean; 
  onClose: () => void; 
  onSelect: (url: string) => void;
  onSelectSliderContent?: (content: string, title: string) => void;
  currentLessonId?: string;
}) {
  const [files, setFiles] = useState<PptxFile[]>([]);
  const [sliderLessons, setSliderLessons] = useState<SliderLessonEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<'pptx' | 'sliders'>('pptx');

  useEffect(() => {
    if (open) {
      setSearch("");
      loadPptxFiles();
      loadSliderLessons();
    }
  }, [open]);

  const loadPptxFiles = async () => {
    setLoading(true);
    const allFiles: PptxFile[] = [];
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      const { data, error } = await supabase.rpc("get_user_storage_files", { bucket_name: "presentations" });
      if (!error && data) {
        for (const f of data as any[]) {
          const filePath = f.file_path || f.file_name;
          const fileName = filePath.split("/").pop() || filePath;
          if (!fileName.toLowerCase().endsWith('.pptx')) continue;
          allFiles.push({
            name: fileName,
            url: `${baseUrl}/storage/v1/object/public/presentations/${filePath}`,
            size: f.file_size || 0,
            created_at: f.created_at || "" });
        }
      }
    } catch (err) {
      console.error("Error loading presentations:", err);
    }
    setFiles(allFiles);
    setLoading(false);
  };

  const loadSliderLessons = async () => {
    try {
      // RLS already filters courses by org/admin access, so just query all accessible slider lessons
      const { data, error } = await supabase
        .from('lessons')
        .select('id, title, content, created_at, course_id, courses(title)')
        .eq('type', 'slider')
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data) {
        const entries: SliderLessonEntry[] = [];
        for (const l of data) {
          if (l.id === currentLessonId) continue;
          try {
            const parsed = JSON.parse(l.content || '[]');
            const slides = Array.isArray(parsed) ? parsed : (parsed.slides || []);
            if (slides.length === 0) continue;
            entries.push({
              lessonId: l.id,
              lessonTitle: l.title,
              courseTitle: (l.courses as any)?.title || '',
              slidesCount: slides.length,
              content: l.content!,
              created_at: l.created_at });
          } catch { continue; }
        }
        setSliderLessons(entries);
      }
    } catch (err) {
      console.error("Error loading slider lessons:", err);
    }
  };

  const filteredFiles = files.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLessons = sliderLessons.filter(l => !search || l.lessonTitle.toLowerCase().includes(search.toLowerCase()) || l.courseTitle.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Выбрать презентацию
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button onClick={() => setTab('pptx')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'pptx' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            PPTX файлы
          </button>
          <button onClick={() => setTab('sliders')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'sliders' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            Из уроков ({sliderLessons.length})
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="pl-9" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
          </div>
        ) : tab === 'pptx' ? (
          filteredFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Presentation className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{files.length === 0 ? "Нет загруженных PPTX" : "Ничего не найдено"}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredFiles.map((file, i) => (
                  <button key={i} onClick={() => onSelect(file.url)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted/70 transition-colors">
                    <Presentation className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size > 0 && formatFileSize(file.size)}
                        {file.created_at && ` · ${new Date(file.created_at).toLocaleDateString("ru-RU")}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )
        ) : (
          filteredLessons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Presentation className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{sliderLessons.length === 0 ? "Нет слайдеров в других уроках" : "Ничего не найдено"}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredLessons.map((entry) => (
                  <button key={entry.lessonId} onClick={() => onSelectSliderContent?.(entry.content, entry.lessonTitle)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted/70 transition-colors">
                    <Presentation className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.lessonTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.slidesCount} сл. · {entry.courseTitle}
                        {entry.created_at && ` · ${new Date(entry.created_at).toLocaleDateString("ru-RU")}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SliderLessonEditor({ lesson, courseId, onUpdate }: SliderLessonEditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingSlideImage, setIsUploadingSlideImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const slideImageInputRef = useRef<HTMLInputElement>(null);

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
        .replace(/_{2 }/g, '_')
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

  const handleSlideImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите файл изображения');
      return;
    }
    setIsUploadingSlideImage(true);
    try {
      const ext = file.name.split('.').pop();
      const uploadPath = `${courseId || 'temp'}/slide_${currentIndex}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('course-files')
        .upload(uploadPath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('course-files')
        .getPublicUrl(uploadPath);
      const updatedSlides = [...slides];
      updatedSlides[currentIndex] = { ...updatedSlides[currentIndex], imageUrl: publicUrl };
      onUpdate({ content: JSON.stringify({ slides: updatedSlides, pptxFileUrl }) });
      toast.success('Изображение слайда обновлено');
    } catch (err) {
      console.error('Slide image upload error:', err);
      toast.error('Ошибка загрузки изображения');
    } finally {
      setIsUploadingSlideImage(false);
      if (slideImageInputRef.current) slideImageInputRef.current.value = '';
    }
  };

  const removeSlideImage = () => {
    const updatedSlides = [...slides];
    updatedSlides[currentIndex] = { ...updatedSlides[currentIndex], imageUrl: undefined };
    onUpdate({ content: JSON.stringify({ slides: updatedSlides, pptxFileUrl }) });
    toast.success('Изображение удалено');
  };

  const handleSelectFromStorage = async (fileUrl: string) => {
    setShowPicker(false);
    setIsLoading(true);
    setUploadProgress('Загрузка презентации...');
    try {
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/));
      const slidesArray: SliderSlide[] = slideFiles.map((_, i) => ({
        id: crypto.randomUUID(),
        title: `Слайд ${i + 1}`,
        content: ''
      }));
      const newContent: SliderContent = { slides: slidesArray, pptxFileUrl: fileUrl };
      onUpdate({ content: JSON.stringify(newContent), title: lesson.title || 'Презентация' });
      setCurrentIndex(0);
      toast.success(`Загружена презентация с ${slideFiles.length} слайдами`);
    } catch (err) {
      console.error('Error loading PPTX from storage:', err);
      toast.error('Ошибка при загрузке презентации');
    } finally {
      setIsLoading(false);
      setUploadProgress('');
    }
  };

  const handleSelectSliderContent = (content: string, title: string) => {
    setShowPicker(false);
    onUpdate({ content, title: lesson.title || title });
    setCurrentIndex(0);
    toast.success('Презентация скопирована из другого урока');
  };

  if (slides.length === 0) {
    return (
      <div className="space-y-3">
        <PptxPickerDialog open={showPicker} onClose={() => setShowPicker(false)} onSelect={handleSelectFromStorage} onSelectSliderContent={handleSelectSliderContent} currentLessonId={lesson.id} />
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
          <Presentation className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
          <p className="text-xs text-muted-foreground/70 mb-4">Слайды с изображениями будут отображаться как интерактивный слайдер</p>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          {isLoading && uploadProgress && <p className="text-xs text-amber-500 mb-4">{uploadProgress}</p>}
          <div className="flex items-center justify-center gap-2">
            <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-500/5 transition-colors">
              {isLoading ? <SigmaSpinner size="sm" className="text-amber-500" /> : <Upload className="w-4 h-4 text-amber-500" />}
              <span className="text-sm">{isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}</span>
              <input type="file" accept=".pptx" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
            </label>
            <Button variant="outline" size="sm" onClick={() => setShowPicker(true)} disabled={isLoading}>
              <FolderOpen className="w-4 h-4 mr-1" />
              Выбрать из загруженных
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  const getViewerUrl = (fileUrl: string): string => {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
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
          <LazyMediaPreview type="slider" className="aspect-auto min-h-[200px]">
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
          </LazyMediaPreview>
        ) : (
          <div className="p-6 min-h-[250px]">
            {currentSlide && (
              <div className="space-y-4">
                {currentSlide.imageUrl ? (
                  <div className="relative group rounded-lg overflow-hidden border border-border bg-secondary/20">
                    <img src={currentSlide.imageUrl} alt={currentSlide.title || 'Слайд'} className="w-full max-h-[400px] object-contain" />
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="secondary" size="sm" className="h-8 gap-1.5 shadow-md" onClick={() => slideImageInputRef.current?.click()} disabled={isUploadingSlideImage}>
                        {isUploadingSlideImage ? <SigmaSpinner size="xs" className=".5 .5" /> : <Replace className="w-3.5 h-3.5" />}
                        Заменить
                      </Button>
                      <Button variant="destructive" size="sm" className="h-8 gap-1.5 shadow-md" onClick={removeSlideImage}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors">
                    {isUploadingSlideImage ? <SigmaSpinner className="text-amber-500" /> : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{isUploadingSlideImage ? 'Загрузка...' : 'Загрузить изображение для слайда'}</span>
                    <input ref={slideImageInputRef} type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" disabled={isUploadingSlideImage} />
                  </label>
                )}
                <input ref={slideImageInputRef} type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" disabled={isUploadingSlideImage} />
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
