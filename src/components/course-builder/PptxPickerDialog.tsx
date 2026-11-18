import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Presentation, FolderOpen, Search } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
  created_at: string;
}

function hasSlides(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    const slides = Array.isArray(parsed) ? parsed : parsed?.slides;
    return Array.isArray(slides) && slides.length > 0;
  } catch { return false; }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

interface PptxPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onSelectSliderContent?: (content: string, title: string) => void;
  currentLessonId?: string;
}

export function PptxPickerDialog({ open, onClose, onSelect, onSelectSliderContent, currentLessonId }: PptxPickerDialogProps) {
  const [files, setFiles] = useState<PptxFile[]>([]);
  const [sliderLessons, setSliderLessons] = useState<SliderLessonEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(false);
  const [sliderStatus, setSliderStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [selectingLessonId, setSelectingLessonId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<'pptx' | 'sliders'>('pptx');
  const generation = useRef(0);
  const selectionRequest = useRef(0);

  useLayoutEffect(() => {
    const requestGeneration = ++generation.current;
    selectionRequest.current += 1;
    setFiles([]);
    setSliderLessons([]);
    setSliderStatus('idle');
    setSelectingLessonId(null);
    setSelectionError(null);
    setFilesError(false);
    setFilesLoading(open);
    setSearch("");
    setTab('pptx');
    if (open) {
      void loadPptxFiles(requestGeneration);
    }
    return () => { generation.current += 1; selectionRequest.current += 1; };
  }, [open, currentLessonId]);

  const loadPptxFiles = async (requestGeneration: number) => {
    const isCurrent = () => requestGeneration === generation.current;
    setFilesLoading(true);
    setFilesError(false);
    const allFiles: PptxFile[] = [];
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      const { data, error } = await supabase.rpc("get_user_storage_files", { bucket_name: "presentations" });
      if (error) throw error;
      if (data) {
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
      if (isCurrent()) setFilesError(true);
    } finally {
      if (isCurrent()) {
        setFiles(allFiles);
        setFilesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!open || tab !== 'sliders' || sliderStatus !== 'idle') return;
    const requestGeneration = generation.current;
    const isCurrent = () => requestGeneration === generation.current;
    setSliderStatus('loading');
    void (async () => {
      try {
        // The server returns titles/counts only, applying the caller's existing RLS.
        const { data, error } = await supabase.rpc('list_slider_lesson_metadata');
        if (!isCurrent()) return;
        if (error) throw error;
        const entries = (data || [])
          .filter(l => l.lesson_id !== currentLessonId)
          .map(l => ({
            lessonId: l.lesson_id,
            lessonTitle: l.lesson_title,
            courseTitle: l.course_title || '',
            slidesCount: l.slides_count,
            created_at: l.created_at,
          }));
        setSliderLessons(entries);
        setSliderStatus('loaded');
      } catch (err) {
        if (isCurrent()) {
          console.error("Error loading slider lessons:", err);
          setSliderStatus('error');
        }
      }
    })();
  }, [open, tab, sliderStatus, currentLessonId]);

  const handleTabChange = (nextTab: 'pptx' | 'sliders') => {
    selectionRequest.current += 1;
    setSelectingLessonId(null);
    setSelectionError(null);
    setTab(nextTab);
  };

  const handleClose = () => {
    generation.current += 1;
    selectionRequest.current += 1;
    onClose();
  };

  const selectSliderLesson = async (entry: SliderLessonEntry) => {
    const requestGeneration = generation.current;
    const requestId = ++selectionRequest.current;
    const isCurrent = () => requestGeneration === generation.current && requestId === selectionRequest.current;
    setSelectingLessonId(entry.lessonId);
    setSelectionError(null);
    try {
      // Fetch exactly one presentation, only after it is selected. Never cache its images in the list.
      const { data, error } = await supabase.from('lessons')
        .select('content').eq('id', entry.lessonId).eq('type', 'slider').maybeSingle();
      if (!isCurrent()) return;
      if (error || !data || typeof data.content !== 'string' || !hasSlides(data.content)) {
        throw new Error('Presentation is unavailable');
      }
      onSelectSliderContent?.(data.content, entry.lessonTitle);
    } catch (err) {
      if (isCurrent()) {
        console.error("Error opening slider lesson:", err);
        setSelectionError('Не удалось открыть презентацию. Выберите её ещё раз, чтобы повторить.');
      }
    } finally {
      if (isCurrent()) setSelectingLessonId(null);
    }
  };

  const filteredFiles = files.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLessons = sliderLessons.filter(l => !search || l.lessonTitle.toLowerCase().includes(search.toLowerCase()) || l.courseTitle.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Выбрать презентацию
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button onClick={() => handleTabChange('pptx')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'pptx' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            PPTX файлы
          </button>
          <button onClick={() => handleTabChange('sliders')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'sliders' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            Из уроков{sliderStatus === 'loaded' ? ` (${sliderLessons.length})` : ''}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="pl-9" />
        </div>
        {selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}
        {(tab === 'pptx' ? filesLoading : sliderStatus === 'idle' || sliderStatus === 'loading') ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
          </div>
        ) : (tab === 'pptx' ? filesError : sliderStatus === 'error') ? (
          <div role="alert" className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Не удалось загрузить презентации.</p>
            <button className="mt-2 text-sm underline" onClick={() => {
              if (tab === 'pptx') void loadPptxFiles(generation.current);
              else setSliderStatus('idle');
            }}>Повторить загрузку</button>
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
                  <button key={entry.lessonId} onClick={() => void selectSliderLesson(entry)}
                    disabled={selectingLessonId !== null}
                    aria-busy={selectingLessonId === entry.lessonId}
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
